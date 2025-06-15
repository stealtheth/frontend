import { createFileRoute } from '@tanstack/react-router'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { sepolia } from 'wagmi/chains';
import { Button } from '@/components/ui/button'
import { 
  parseEther, 
  parseAbi, 
  encodeAbiParameters,
  decodeAbiParameters, 
  parseAbiParameters,
  createPublicClient,
  http,
  isAddress,
} from 'viem'

import {
  type Secret,
  hashPrecommitment,
} from "@0xbow/privacy-pools-core-sdk";

import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants"
import { signerToEcdsaValidator, getKernelAddressFromECDSA } from "@zerodev/ecdsa-validator"
import { 
  createKernelAccount, 
  createKernelAccountClient, 
  createZeroDevPaymasterClient
} from "@zerodev/sdk"

import { Identity } from "@semaphore-protocol/identity";
import { SemaphoreEthers, SemaphoreSubgraph } from "@semaphore-protocol/data";
import { Group } from "@semaphore-protocol/group";
import { generateProof, verifyProof } from "@semaphore-protocol/proof";
import { prepareUSDCOp } from '@/lib/usdc';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

import { extractViewingPrivateKeyNode, generateEphemeralPrivateKey, generateFluidkeyMessage, generateKeysFromSignature, generateStealthAddresses, generateStealthPrivateKey } from "@fluidkey/stealth-account-kit"
import { privateKeyToAccount } from 'viem/accounts';


const CONTRACT_ABI = parseAbi([
  "function deposit(uint256 precommitmentHash) external payable",
]);
const SEMAPHORE_ADMIN_ABI = parseAbi([
  "function joinGroup(uint256 groupId, address semaphore, uint256 identityCommitment) external payable",
  "function isMember(uint256 commitment) external",
]);

const ENTRYPOINT_ADDRESS = "0x0e95a2ac10745cad4fdf00394cb6419ed24374f7";
const DEPOSIT_AMOUNT = parseEther("0.001"); // 0.001 ETH

const ZERODEV_RPC = 'https://rpc.zerodev.app/api/v3/492f3962-eff6-49ea-bddb-916d21cbf7fc/chain/11155111';
const SEPOLIA_RPC = 'https://eth-sepolia.g.alchemy.com/v2/alvfYVoqtfz_sWLhV9o9AN0Z9HQyyb3O';
const entryPoint = getEntryPoint("0.7")
const kernelVersion = KERNEL_V3_1
const SEMAPHORE_GROUP_ID = 0;
const SEMAPHORE_ADMIN_ADDRESS = "0x4Cd39b36ae99C2c4DAE1f6af989feC0E34bf67f2";
const SEMAPHORE_PAYMASTER_ADDRESS = "0xDA79AD2A2afBE758d3F015720F4841754833922c";
const SEMAPHORE_DEPOSIT_AMOUNT = parseEther("0.001"); // 0.001 ETH

export const Route = createFileRoute('/')({
  component: App,
})


function App() {
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();

  const publicClient = createPublicClient({
    transport: http(SEPOLIA_RPC),
    chain: sepolia,
  });
  const publicClientWithBlock = createPublicClient({
    transport: http('https://rpc.ankr.com/eth_sepolia/23dd4dc19ab6c2f080ea516ca4d834a85cd7e1956128fad2dff9d34db759e52f'),
    chain: sepolia,
  });
  // Zerodev
  const zerodevPublicClient = createPublicClient({
    transport: http(ZERODEV_RPC),
    chain: sepolia,
  });
  const zerodevPaymaster = createZeroDevPaymasterClient({
    transport: http(ZERODEV_RPC),
    chain: sepolia,
  });

  const [stealthAddresses, setStealthAddresses] = useState<string[]>([]);
  

  // Generating paymaster data
  async function generatePaymasterData(
      id: Identity,
      group: Group,
      message: bigint,
      groupId: number
  ) {
      const proof = await generateProof(id, group, message, groupId);
      await verifyProof(proof);
      
      const paymasterData = encodeAbiParameters(
        parseAbiParameters(
          "(uint256, (uint256, uint256, uint256, uint256, uint256, uint256[8]))"
        ),
        [
          [
          BigInt(groupId), [
            BigInt(proof.merkleTreeDepth),
            BigInt(proof.merkleTreeRoot),
            BigInt(proof.nullifier),
            BigInt(proof.message),
            BigInt(proof.scope),
            proof.points.map(p => BigInt(p)) as any
          ]]
        ]
      );
      return paymasterData;
  };
  const setupZerodev = async () => {
    if (!publicClient || !walletClient || !address) return;
    try {
      // Create a Semaphore identity
      const identitySemaphoreMessage = "Creating a new Semaphore identity";
      const signature = await walletClient.signMessage({ message:identitySemaphoreMessage });
      const identitySemaphore = new Identity(signature);
      console.log("Identity commitment: ", identitySemaphore.commitment);


      // Check if the user is already in the group
      let isMember: boolean;
      isMember = await publicClient.readContract({
        address: SEMAPHORE_ADMIN_ADDRESS,
        abi: SEMAPHORE_ADMIN_ABI,
        functionName: "isMember",
        args: [identitySemaphore.commitment],
      }) as boolean;
      console.log("isMember", isMember);

      // if (!isMember) {
      //   const joinGroupTx = await walletClient.writeContract({
      //     address: SEMAPHORE_ADMIN_ADDRESS,
      //     abi: SEMAPHORE_ADMIN_ABI,
      //     functionName: "joinGroup",
      //     args: [BigInt(0), SEMAPHORE_PAYMASTER_ADDRESS, identitySemaphore.commitment],
      //     value: SEMAPHORE_DEPOSIT_AMOUNT,
      //   });
      //   console.log("joinGroupTx", joinGroupTx);
      // }

      // Construct a validator
      const ecdsaValidator = await signerToEcdsaValidator(zerodevPublicClient, {
        signer: walletClient, // Pass the wallet client as the signer
        entryPoint,
        kernelVersion
      });
      
      // Construct a Kernel account
      const account = await createKernelAccount(zerodevPublicClient, {
        plugins: {
          sudo: ecdsaValidator,
        },
        entryPoint,
        kernelVersion
      });

      // Get the smart account address
      const smartAccountAddress = await getKernelAddressFromECDSA({
        publicClient: zerodevPublicClient,
        eoaAddress: address,
        index: BigInt(0), 
        entryPoint, 
        kernelVersion, 
      });
      console.log("smartAccountAddress", smartAccountAddress);

      
      const memberAddedEvents = await publicClientWithBlock.getLogs({
        address: SEMAPHORE_PAYMASTER_ADDRESS,
        event: {
          type: 'event',
          name: 'MemberAdded',
          inputs: [
            { name: 'groupId', type: 'uint256', indexed: true },
            { name: 'index', type: 'uint256', indexed: false },
            { name: 'identityCommitment', type: 'uint256', indexed: false },
            { name: 'merkleTreeRoot', type: 'uint256', indexed: false }
          ]
        },
        args: {
          groupId: BigInt(SEMAPHORE_GROUP_ID)
        },
        fromBlock: BigInt(8553079),
        toBlock: 'latest'
      });
      
      console.log("[useSemaphore] Found", memberAddedEvents.length, "member events");
      
      const existingMembers = memberAddedEvents.map(event => ({
        index: Number(event.args.index),
        commitment: (event.args.identityCommitment as bigint).toString()
      }));

      const semaphoreGroup = new Group(existingMembers.map(member => BigInt(member.commitment)))

      // const semaphoreGroup = new Group(members)
      const paymasterData = await generatePaymasterData(identitySemaphore, semaphoreGroup, BigInt(smartAccountAddress), SEMAPHORE_GROUP_ID)
      console.log("paymasterData", paymasterData);

      // Construct a Kernel account client
      const kernelClient = createKernelAccountClient({
        account,
        chain: sepolia,
        bundlerTransport: http(ZERODEV_RPC),
        // Required - the public client
        client: publicClient,
        paymaster: {
            getPaymasterData(userOperation) {
                return zerodevPaymaster.sponsorUserOperation({userOperation})
            }
        },
      });

      const accountAddress = kernelClient.account.address;
      console.log("My account:", accountAddress);
      
      if (!isAddress(toAddress)) {
        console.log("Invalid address")
        return;
      }

      const usdcOp = await prepareUSDCOp(kernelClient, publicClient, toAddress);

      if (!usdcOp) {
        console.log("no USDC in this account")
        return;
      }
      const userOpHash = await kernelClient.sendUserOperation({
        callData: usdcOp,
        paymaster: SEMAPHORE_PAYMASTER_ADDRESS,
        paymasterVerificationGasLimit: BigInt(2000000),
        paymasterPostOpGasLimit: BigInt(2000000),
        paymasterData,
      });

      console.log("UserOp hash:", userOpHash)
      console.log("Waiting for UserOp to complete...")
    
      const userOp = await kernelClient.waitForUserOperationReceipt({
        hash: userOpHash,
        timeout: 1000 * 15,
      })
    
      console.log("UserOp completed: https://eth-sepolia.blockscout.com/op/" + userOpHash)

    return kernelClient;

    } catch (error) {
      console.error("Error in setupZerodev:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      throw error;
    }
  };

  const handleFetchStealthAddresses = async () => {
    if (!walletClient || !publicClient) {
      throw new Error("Wallet not connected");
    }

    const { message } = await generateFluidkeyMessage({ pin: "0000", address: walletClient.account.address })

    const signature = await walletClient.signMessage({ message })

    console.log("signature", signature)

    const { spendingPrivateKey, viewingPrivateKey } = generateKeysFromSignature(signature)

    const derivedBIP32Node = extractViewingPrivateKeyNode(
      viewingPrivateKey,
      0
    );

    const spendingAccount = privateKeyToAccount(
      spendingPrivateKey
    );
    const spendingPublicKey = spendingAccount.publicKey;


    const startNonce = 0;
    const endNonce = 10;

    const _stealthAddresses: string[] = [];

    for (let i = startNonce; i < endNonce; i++) {
      const { ephemeralPrivateKey } = generateEphemeralPrivateKey({
        viewingPrivateKeyNode: derivedBIP32Node,
        nonce: BigInt(i),
        chainId: 11155111, // sepolia
      });

      const { stealthAddresses } = generateStealthAddresses({
        spendingPublicKeys: [spendingPublicKey],
        ephemeralPrivateKey: ephemeralPrivateKey,
      });

      

      // const stealthPrivateKey = generateStealthPrivateKey({ ephemeralPublicKey: ephemeralPrivateKey, spendingPrivateKey})

      _stealthAddresses.push(stealthAddresses[0])

    }

    setStealthAddresses(_stealthAddresses);
  }

  const handleDeposit = async () => {
    try {
      if (!walletClient || !publicClient) {
        throw new Error("Wallet not connected");
      }

      console.log("\n📦 Creating deposit commitment...");
      const existingNullifier = BigInt(Math.floor(Math.random() * 10000000000000000)) as Secret;
      const existingSecret = BigInt(Math.floor(Math.random() * 10000000000000000)) as Secret;
      console.log("existingNullifier", existingNullifier);
      console.log("existingSecret", existingSecret);
      const precommitment = {
        hash: hashPrecommitment(existingNullifier, existingSecret),
        nullifier: existingNullifier,
        secret: existingSecret,
      };
      console.log("precommitment hash:", precommitment.hash.toString());

      // 2. Make deposit
      console.log("\n💸 Making deposit...");
      
      
      // Log the transaction parameters
      console.log('Transaction parameters:', {
        amount: DEPOSIT_AMOUNT.toString(),
        precommitmentHash: precommitment.hash.toString(),
        value: DEPOSIT_AMOUNT.toString()
      });

      // Make the deposit
      const depositTx = await walletClient.writeContract({
        address: ENTRYPOINT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "deposit",
        args: [precommitment.hash],
        value: DEPOSIT_AMOUNT,
      });
      
      console.log("⏳ Waiting for deposit transaction...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: depositTx });
      console.log("receipt", receipt);
     
      // Get the event logs
      const logs = receipt.logs.filter((log: { topics: string[] }) => 
        log.topics[0] === "0xe3b53cd1a44fbf11535e145d80b8ef1ed6d57a73bf5daa7e939b6b01657d6549"
      );
      const decodedValues = decodeAbiParameters(parseAbiParameters('uint256, uint256, uint256, uint256'), logs[0].data);
      console.log("_label", decodedValues[1]);

      console.log("✅ Deposit successful! Transaction hash:", depositTx);
    } catch (error: any) {
      console.error("Error during deposit:", error);
      // Log more details about the error
      if (error.data) {
        console.error("Error data:", error.data);
      }
      if (error.transaction) {
        console.error("Transaction details:", error.transaction);
      }
    }
  };

  const [toAddress, setToAddress] = useState("");

  return (
    <div>
      <ConnectButton />
      <div>
        <Button onClick={handleDeposit}>
          Deposit
        </Button>
        <Button onClick={handleFetchStealthAddresses}>
          Fetch Stealth Addresses
        </Button>
        <Input placeholder="To address" value={toAddress} onChange={(e) => setToAddress(e.target.value)} />
        <Button 
          onClick={setupZerodev}
          variant="outline"
        >
          Send USDC to {toAddress} using ZeroDev
        </Button>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stealth Address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stealthAddresses.map((address) => (
              <TableRow key={address}>
                <TableCell>{address}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
