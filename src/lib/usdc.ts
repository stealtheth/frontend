import { parseAbi, type PublicClient, encodeFunctionData, type Address } from "viem"
import { type KernelAccountClient } from "@zerodev/sdk"


export const USDC_SEPOLIA = "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238"

export async function prepareUSDCOp(kernelClient: KernelAccountClient, publicClient: PublicClient, toAddress: Address) {
    if (!kernelClient.account) {
        throw new Error("Kernel account not found")
    }

    console.log("kernel account address", kernelClient.account.address)

    const balance = await publicClient.readContract({
        address: USDC_SEPOLIA,
        abi: parseAbi([
            "function balanceOf(address account) view returns (uint256)",
        ]),
        functionName: "balanceOf",
        args: [kernelClient.account.address],
    })

    if (balance === 0n) {
        return null;
    }

    const calls = kernelClient.account.encodeCalls([{
        to: USDC_SEPOLIA,
        value: 0n,
        data: encodeFunctionData({
            abi: parseAbi([
                "function transfer(address to, uint256 amount) returns (bool)",
            ]),
            functionName: "transfer",
            args: [
                toAddress,
                balance,
            ],
        }),
      }])

    return calls;
}