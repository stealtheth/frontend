import { createFileRoute } from '@tanstack/react-router'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { sepolia } from 'wagmi/chains';
import { Button } from '@/components/ui/button'
import { 
  parseEther, 
  parseAbi, 
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

import { Identity } from "@semaphore-protocol/identity"
import { prepareUSDCOp } from '@/lib/usdc';
import { Input } from '@/components/ui/input';
import { useState } from 'react';


import { extractViewingPrivateKeyNode, generateEphemeralPrivateKey, generateFluidkeyMessage, generateKeysFromSignature, generateStealthAddresses, generateStealthPrivateKey } from "@fluidkey/stealth-account-kit"
import { privateKeyToAccount } from 'viem/accounts';
import { getPrivateKeyForSigner } from '@/lib/stealth';
import { StealthTable } from '@/components/StealthTable';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

const CONTRACT_ABI = parseAbi([
  "function deposit(uint256 precommitmentHash) external payable",
]);
const SEMAPHORE_ADMIN_ABI = parseAbi([
  "function joinGroup(uint256 groupId, address semaphore,uint256 identityCommitment) external payable",
]);

const ENTRYPOINT_ADDRESS = "0x0e95a2ac10745cad4fdf00394cb6419ed24374f7";
const DEPOSIT_AMOUNT = parseEther("0.001"); // 0.001 ETH

const ZERODEV_RPC = 'https://rpc.zerodev.app/api/v3/492f3962-eff6-49ea-bddb-916d21cbf7fc/chain/11155111';
const entryPoint = getEntryPoint("0.7")
const kernelVersion = KERNEL_V3_1

const SEMAPHORE_ADMIN_ADDRESS = "0x13e7f88382041201F23d58BaE18eA9d2248f4e3b";
const SEMAPHORE_PAYMASTER_ADDRESS = "0x67D4dd5251D7797590A4C99d55320Eabd3C8611a";
const SEMAPHORE_DEPOSIT_AMOUNT = parseEther("0.001"); // 0.001 ETH

export const Route = createFileRoute('/')({
  component: App,
})

function Header() {
  return (
    <header className="flex items-center justify-between p-4 border-b">
      <h1 className="text-2xl font-bold">StealthETH</h1>
      <ConnectButton />
    </header>
  );
}

function Footer() {
  return (
    <footer className="text-center p-4 border-t">
      <p>Built for the ETHGlobal Brussels Hackathon</p>
    </footer>
  );
}

function App() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { address } = useAccount();

  const zerodevPublicClient = createPublicClient({
    transport: http(ZERODEV_RPC),
    chain: sepolia,
  });
  const zerodevPaymaster = createZeroDevPaymasterClient({
    transport: http(ZERODEV_RPC),
    chain: sepolia,
  })

  const [stealthAddresses, setStealthAddresses] = useState<`0x${string}`[]>([]);
  const [stealthPrivateKeys, setStealthPrivateKeys] = useState<string[]>([]);
  
  const setupZerodev = async () => {
    if (!publicClient || !walletClient || !address) return;
    try {
      // Create a Semaphore identity
      const identitySemaphoreMessage = "Creating a new Semaphore identity";
      const signature = await walletClient.signMessage({ message:identitySemaphoreMessage });
      const { privateKey, publicKey, commitment } = new Identity(signature);
      console.log("Identity commitment: ", commitment);

      // Join to the Semaphore group
      const joinGroupTx =await walletClient.writeContract({
        address: SEMAPHORE_ADMIN_ADDRESS,
        abi: SEMAPHORE_ADMIN_ABI,
        functionName: "joinGroup",
        args: [BigInt(0), SEMAPHORE_PAYMASTER_ADDRESS, commitment],
        value: SEMAPHORE_DEPOSIT_AMOUNT,
      });
      console.log("joinGroupTx", joinGroupTx);

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
      });

      console.log("UserOp hash:", userOpHash)
      console.log("Waiting for UserOp to complete...")
    
      await kernelClient.waitForUserOperationReceipt({
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

    const _stealthAddresses: `0x${string}`[] = [];
    const _stealthPrivateKeys: string[] = [];

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
      const stealthPrivateKey = getPrivateKeyForSigner({ ephemeralPrivateKey, spendingPrivateKey, spendingPublicKey })

      _stealthAddresses.push(stealthAddresses[0])
      _stealthPrivateKeys.push(stealthPrivateKey.slice(2))

    }

    setStealthAddresses(_stealthAddresses);
    setStealthPrivateKeys(_stealthPrivateKeys);
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
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Header />
      <main className="flex-1 p-4 md:p-8">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold mb-8 text-center">Anonymous USDC Payments</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <CardTitle>1. Deposit ETH</CardTitle>
                <CardDescription>Deposit 0.001 ETH to a privacy pool.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleDeposit} className="w-full">
                  Deposit
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>2. Generate Stealth Addresses</CardTitle>
                <CardDescription>Create new stealth addresses for receiving funds privately.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleFetchStealthAddresses} className="w-full">
                  Fetch Stealth Addresses
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>3. Send USDC Anonymously</CardTitle>
                <CardDescription>Send USDC to any address using a ZeroDev smart account.</CardDescription>
              </CardHeader>
              <CardContent>
                <Input placeholder="To address" value={toAddress} onChange={(e) => setToAddress(e.target.value)} className="mb-4" />
              </CardContent>
            </Card>
          </div>

          {stealthAddresses.length > 0 && (
            <div className="mt-8">
              <h3 className="text-2xl font-bold mb-4 text-center">Your Stealth Accounts</h3>
              <Card>
                <CardContent className="p-0">
                  <StealthTable stealthAddresses={stealthAddresses} stealthPrivateKeys={stealthPrivateKeys} toAddress={toAddress} />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
