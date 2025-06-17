// StealthRow.tsx
import { TableRow, TableCell } from '@/components/ui/table';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBalance } from 'wagmi';
import type { Address } from 'viem';
import { useSendUSDC } from '@/hooks/useSendUSDC';
import { toast } from "sonner"

const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia

interface StealthRowProps {
  kernelAddress: Address;
  stealthAddress: Address;
  stealthPrivateKey: `0x${string}`;
  toAddress: Address;
}

export function StealthRow({
  kernelAddress,
  stealthAddress,
  stealthPrivateKey,
  toAddress,
}: StealthRowProps) {
  const { sendUSDC, isSending } = useSendUSDC()
  const { data: balance } = useBalance({
    address: kernelAddress,
    chainId: 11155111,
    token: USDC_ADDRESS,
  });

  const handleSend = async () => {
    const userOpHash = await sendUSDC(stealthPrivateKey, toAddress)
    toast.success("USDC sent successfully", {
        action: {
            label: "View in explorer",
            onClick: () => window.open(`https://eth-sepolia.blockscout.com/op/${userOpHash}`, "_blank"),
        },
        position: "top-center",
    })
  }

  console.log(balance, stealthAddress)

  return (
    <TableRow key={stealthAddress}>
      <TableCell>{kernelAddress}</TableCell>
      <TableCell>{stealthAddress}</TableCell>

      <TableCell
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => navigator.clipboard.writeText(stealthPrivateKey)}
      >
        <div className="flex items-center gap-2">
          {stealthPrivateKey.slice(0, 6)}…{stealthPrivateKey.slice(-4)}
          <Copy className="h-4 w-4" />
        </div>
      </TableCell>

      <TableCell>
        {balance?.formatted ?? '0'} {balance?.symbol ?? 'USDC'}
      </TableCell>

      <TableCell>
        <Button variant="outline" onClick={handleSend} disabled={isSending || !toAddress}>Shield</Button>
      </TableCell>
    </TableRow>
  );
}
