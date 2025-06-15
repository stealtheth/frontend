// StealthTable.tsx
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
} from '@/components/ui/table';
import { useKernelAddresses } from '@/hooks/useKernelAddresses';
import { StealthRow } from './StealthRow';
import type { Address } from 'viem';

interface StealthTableProps {
  stealthAddresses: `0x${string}`[];
  stealthPrivateKeys: string[];
  toAddress: Address;
}

export function StealthTable({
  stealthAddresses,
  stealthPrivateKeys,
  toAddress,
}: StealthTableProps) {
  const kernelAddresses = useKernelAddresses(stealthAddresses);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kernel Address</TableHead>
          <TableHead>Stealth Address</TableHead>
          <TableHead>Stealth Private Key</TableHead>
          <TableHead>Balance</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {stealthAddresses.map((addr, i) => (
          <StealthRow
            toAddress={toAddress}
            key={addr}
            kernelAddress={kernelAddresses[i] as Address}
            stealthAddress={addr}
            stealthPrivateKey={`0x${stealthPrivateKeys[i]}`}
          />
        ))}
      </TableBody>
    </Table>
  );
}
