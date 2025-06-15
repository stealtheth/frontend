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

import { extractViewingPrivateKeyNode, generateEphemeralPrivateKey, generateFluidkeyMessage, generateKeysFromSignature, generateStealthAddresses, generateStealthPrivateKey } from "@fluidkey/stealth-account-kit"
import { privateKeyToAccount } from 'viem/accounts';
import { getPrivateKeyForSigner } from '@/lib/stealth';
import { StealthTable } from '@/components/StealthTable';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

const CONTRACT_ABI = parseAbi([
  "function deposit(uint256 precommitmentHash) external payable",
]);
const SEMAPHORE_ADMIN_ABI = parseAbi([
  "function joinGroup(uint256 groupId, address semaphore, uint256 identityCommitment) external payable",
  "function isMember(uint256 commitment) external view returns (bool)",
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

  const [stealthAddresses, setStealthAddresses] = useState<`0x${string}`[]>([]);
  const [stealthPrivateKeys, setStealthPrivateKeys] = useState<string[]>([]);
  
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

    if (!walletClient) {
      throw new Error("Wallet not connected");
    }

    const idSeedMsg = "Creating a new Semaphore identity!!";
    const signature = await walletClient.signMessage({ 
      account: walletClient.account,
      message: idSeedMsg 
    });

    const identity = new Identity(signature);
    if (!walletClient || !publicClient) {
      throw new Error("Wallet not connected");
    }

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
    
  }

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
