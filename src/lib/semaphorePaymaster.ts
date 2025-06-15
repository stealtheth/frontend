import {
    generateProof,
    verifyProof,
  } from "@semaphore-protocol/proof";
  import { Identity } from "@semaphore-protocol/identity";
  import { Group } from "@semaphore-protocol/group";
  import {
    type PublicClient,
    type WalletClient,
    encodeAbiParameters,
    parseAbiParameters,
    parseEther,
  } from "viem";
  import { parseAbi } from "viem/utils";
  import { sepolia } from "viem/chains";
  
  /* -------------------------------------------------------------------------- */
  /*                                CONSTANTS                                   */
  /* -------------------------------------------------------------------------- */
  
  export const SEMAPHORE_GROUP_ID = 0;
  export const SEMAPHORE_ADMIN_ADDRESS =
    "0x4Cd39b36ae99C2c4DAE1f6af989feC0E34bf67f2";
  export const SEMAPHORE_PAYMASTER_ADDRESS =
    "0xDA79AD2A2afBE758d3F015720F4841754833922c";
  export const SEMAPHORE_DEPOSIT_AMOUNT = parseEther("0.001"); // 0.001 ETH
  
  const SEMAPHORE_ADMIN_ABI = parseAbi([
    "function joinGroup(uint256 groupId, address semaphore, uint256 identityCommitment) external payable",
    "function isMember(uint256 commitment) external view returns (bool)",
  ]);
  
  /* -------------------------------------------------------------------------- */
  /*                           PAYMASTER HELPER API                              */
  /* -------------------------------------------------------------------------- */
  
  export interface SemaphorePaymasterInfo {
    paymasterAddress: `0x${string}`;
    paymasterData: `0x${string}`;
    // Reasonable gas cushions – tweak if you hit "execution out of gas"
    verificationGasLimit: bigint;
    postOpGasLimit: bigint;
  }
  
  /**
   * Creates / (lazily) registers a Semaphore identity, generates the
   * zkSNARK proof and returns the calldata that the paymaster expects.
   *
   * You call this once **right before** sending the UserOperation.
   */
  export async function buildSemaphorePaymasterData(
    walletClient: WalletClient,
    publicClient: PublicClient,
  ): Promise<SemaphorePaymasterInfo> {
    /* 1. Build or fetch the user's Semaphore identity (one-liner derive from
          an ECDSA sig keeps it deterministic)                                       */
    const idSeedMsg = "Creating a new Semaphore identity!!";
    if (!walletClient.account) throw new Error("Wallet client has no account");
    const signature = await walletClient.signMessage({ 
      account: walletClient.account,
      message: idSeedMsg 
    });
    const identity = new Identity(signature);
  
    /* 2. Make sure the identity is in the on-chain group (deposit happens once)  */
    const isMember: boolean = (await publicClient.readContract({
      address: SEMAPHORE_ADMIN_ADDRESS,
      abi: SEMAPHORE_ADMIN_ABI,
      functionName: "isMember",
      args: [identity.commitment],
    })) as boolean;
  
    if (!isMember) {
      await walletClient.writeContract({
        address: SEMAPHORE_ADMIN_ADDRESS,
        abi: SEMAPHORE_ADMIN_ABI,
        functionName: "joinGroup",
        args: [
          BigInt(SEMAPHORE_GROUP_ID),
          SEMAPHORE_PAYMASTER_ADDRESS,
          identity.commitment,
        ],
        value: SEMAPHORE_DEPOSIT_AMOUNT,
        chain: sepolia,
        account: walletClient.account,
      });
      // give the tx a block or two – easiest is just a tiny delay
      await new Promise((r) => setTimeout(r, 2_000));
    }
  
    /* 3. Fetch current group members so we can build the Merkle path            */
    const memberEvents = await publicClient.getLogs({
      address: SEMAPHORE_PAYMASTER_ADDRESS,
      event: {
        type: "event",
        name: "MemberAdded",
        inputs: [
          { name: "groupId", type: "uint256", indexed: true },
          { name: "index", type: "uint256", indexed: false },
          { name: "identityCommitment", type: "uint256", indexed: false },
          { name: "merkleTreeRoot", type: "uint256", indexed: false },
        ],
      },
      args: { groupId: BigInt(SEMAPHORE_GROUP_ID) },
      fromBlock: BigInt(8_553_079), // first block of the paymaster
      toBlock: "latest",
    });
  
    const group = new Group(
      memberEvents.map((ev) => BigInt(ev.args.identityCommitment!))
    );
  
    /* 4. Generate & verify the witness                                           */
    const message = BigInt(walletClient.account.address); // scope proof to our smart-account
    const proof = await generateProof(
      identity,
      group,
      message,
      SEMAPHORE_GROUP_ID
    );
    await verifyProof(proof);
  
    /* 5. ABI-encode what the paymaster contract expects                          */
    const paymasterData = encodeAbiParameters(
      parseAbiParameters(
        "(uint256, (uint256, uint256, uint256, uint256, uint256, uint256[8]))"
      ),
      [
        [
          BigInt(SEMAPHORE_GROUP_ID),
          [
            BigInt(proof.merkleTreeDepth),
            BigInt(proof.merkleTreeRoot),
            BigInt(proof.nullifier),
            BigInt(proof.message),
            BigInt(proof.scope),
            proof.points.map((p) => BigInt(p)) as any,
          ],
        ],
      ]
    ) as `0x${string}`;
  
    return {
      paymasterAddress: SEMAPHORE_PAYMASTER_ADDRESS,
      paymasterData,
      verificationGasLimit: BigInt(2_000_000),
      postOpGasLimit: BigInt(2_000_000),
    };
  }
  