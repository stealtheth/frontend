import { useCallback, useState } from "react";
import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";

import {
  KERNEL_V3_1,
  getEntryPoint,
} from "@zerodev/sdk/constants";
import {
  signerToEcdsaValidator,
} from "@zerodev/ecdsa-validator";
import {
  createKernelAccount,
  createKernelAccountClient,
  type KernelAccountClient,
} from "@zerodev/sdk";

import { prepareUSDCOp, USDC_SEPOLIA } from "@/lib/usdc";
import { privateKeyToAccount } from "viem/accounts";

import {
  buildSemaphorePaymasterData,
} from "@/lib/semaphorePaymaster";
import { useWalletClient } from "wagmi";

/* RPC that ZeroDev gave you for Sepolia */
const ZERODEV_RPC =
  "https://rpc.zerodev.app/api/v3/492f3962-eff6-49ea-bddb-916d21cbf7fc/chain/11155111";

const entryPoint = getEntryPoint("0.7");
const kernelVersion = KERNEL_V3_1;

interface UseSendUSDCResult {
  sendUSDC: (privateKey: `0x${string}`, to: Address) => Promise<string>; // returns userOp hash
  isSending: boolean;
  lastHash: string | null;
  error: unknown;
}

/**
 * React hook that exposes `sendUSDC(privateKey, toAddress)`.
 *
 * The function:
 *  1. Spins up a viem wallet & public client from the given private key.
 *  2. Builds a ZeroDev Kernel account + client (bundler).
 *  3. Uses `prepareUSDCOp` to create the callData that transfers all USDC
 *     held by the Kernel account to `toAddress`.
 *  4. Generates Semaphore paymaster data & sends the UserOperation.
 */
export function useSendUSDC(): UseSendUSDCResult {
  const [isSending, setIsSending] = useState(false);
  const [lastHash, setLastHash] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const {data: mainWalletClient} = useWalletClient()

  const sendUSDC = useCallback(
    async (privateKey: `0x${string}`, toAddress: Address) => {
      setIsSending(true);
      setError(null);
      try {
        /* ------------------------------------------------------------------
         * 1. Bootstrap viem clients from the raw private key
         * ------------------------------------------------------------------ */
        const account = privateKeyToAccount(privateKey);
        const walletClient = createWalletClient({
          account,
          chain: sepolia,
          transport: http(), // default public RPC
        });
        const publicClient = createPublicClient({
          chain: sepolia,
          transport: http(), // default public RPC
        });

        /* ------------------------------------------------------------------
         * 2. Build the Kernel account + client (no paymaster here!)
         * ------------------------------------------------------------------ */
        const zerodevPublicClient = createPublicClient({
          chain: sepolia,
          transport: http(ZERODEV_RPC),
        });

        const ecdsaValidator = await signerToEcdsaValidator(
          zerodevPublicClient,
          { signer: walletClient, entryPoint, kernelVersion }
        );

        const kernelAccount = await createKernelAccount(zerodevPublicClient, {
          plugins: { sudo: ecdsaValidator },
          entryPoint,
          kernelVersion,
        });

        const kernelClient: KernelAccountClient = createKernelAccountClient({
          account: kernelAccount,
          chain: sepolia,
          bundlerTransport: http(ZERODEV_RPC),
          client: publicClient,
        });

        /* ------------------------------------------------------------------
         * 3. Prepare the call data that transfers USDC
         * ------------------------------------------------------------------ */
        const callData = await prepareUSDCOp(
          kernelClient,
          publicClient,
          toAddress
        );

        if (!callData) {
          throw new Error(
            `Kernel account holds no USDC (${USDC_SEPOLIA}) on Sepolia.`
          );
        }

        /* ------------------------------------------------------------------
         * 4. Build the Semaphore paymaster data & send the UserOp
         * ------------------------------------------------------------------ */
        const {
          paymasterAddress,
          paymasterData,
          verificationGasLimit,
          postOpGasLimit,
        } = await buildSemaphorePaymasterData(mainWalletClient, publicClient);

        const userOpHash = await kernelClient.sendUserOperation({
          callData,
          paymaster: paymasterAddress,
          paymasterData,
          paymasterVerificationGasLimit: verificationGasLimit,
          paymasterPostOpGasLimit: postOpGasLimit,
        });

        setLastHash(userOpHash);

        // optional: wait for inclusion so caller can block on success
        await kernelClient.waitForUserOperationReceipt({
          hash: userOpHash,
          timeout: 1_000 * 90, // 90 s timeout
        });

        console.log("UserOperation sent successfully", userOpHash);
        return userOpHash;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [mainWalletClient]
  );

  return { sendUSDC, isSending, lastHash, error };
}
