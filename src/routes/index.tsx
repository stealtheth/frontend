import { createFileRoute } from '@tanstack/react-router'
import logo from '../logo.svg'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { Button } from '@/components/ui/button'
import { parseEther, parseAbi } from 'viem'

import {
  type Secret,
  hashPrecommitment,
} from "@0xbow/privacy-pools-core-sdk";

const CONTRACT_ABI = parseAbi([
  "function deposit(uint256 precommitmentHash) external payable",
]);
const ENTRYPOINT_ADDRESS = "0x0e95a2ac10745cad4fdf00394cb6419ed24374f7";
const DEPOSIT_AMOUNT = parseEther("0.001"); // 0.001 ETH

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

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
      // const logs = receipt.logs.filter((log: { topics: string[] }) => 
      //   log.topics[0] === "0xe3b53cd1a44fbf11535e145d80b8ef1ed6d57a73bf5daa7e939b6b01657d6549"
      // );
      
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

  return (
    <div>
      <ConnectButton />
      <div>
        <Button onClick={handleDeposit}>
          Deposit
        </Button>
      </div>
    </div>
  )
}
