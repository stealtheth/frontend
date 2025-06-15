import { getKernelAddressFromECDSA } from "@zerodev/ecdsa-validator";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { useEffect, useState } from "react";
import type { PublicClient } from "viem";
import { usePublicClient } from "wagmi";

const entryPoint = getEntryPoint("0.7");
const kernelVersion = KERNEL_V3_1;

async function getKernelAddress(stealthAddress: string, publicClient: PublicClient) {

    const smartAccountAddress = await getKernelAddressFromECDSA({
        publicClient,
        eoaAddress: stealthAddress as `0x${string}`,
        index: BigInt(0), 
        entryPoint, 
        kernelVersion, 
      });
      return smartAccountAddress
    }


export function useKernelAddresses(stealthAddresses: string[]) {
  const publicClient = usePublicClient();
  const [kernelAddresses, setKernelAddresses] = useState<string[]>([]);

  useEffect(() => {
    if (!publicClient) return;

    const fetchAddresses = async () => {
      const addresses = await Promise.all(
        stealthAddresses.map((address) => getKernelAddress(address, publicClient))
      );
      setKernelAddresses(addresses);
    };

    fetchAddresses();
  }, [stealthAddresses, publicClient]);

  return kernelAddresses;
}
