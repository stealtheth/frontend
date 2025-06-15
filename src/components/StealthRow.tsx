// StealthRow.tsx
import { TableRow, TableCell } from '@/components/ui/table';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBalance } from 'wagmi';
import type { Address } from 'viem';

const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia

interface StealthRowProps {
  kernelAddress: Address;
  stealthAddress: Address;
  stealthPrivateKey: `0x${string}`;
}

export function StealthRow({
  kernelAddress,
  stealthAddress,
  stealthPrivateKey,
}: StealthRowProps) {
  const { data: balance } = useBalance({
    address: kernelAddress,
    chainId: 11155111,
    token: USDC_ADDRESS,
  });
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
        <Button variant="outline">Shield</Button>
      </TableCell>
    </TableRow>
  );
}
