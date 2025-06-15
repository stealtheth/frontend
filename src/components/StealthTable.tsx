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

interface StealthTableProps {
  stealthAddresses: `0x${string}`[];
  stealthPrivateKeys: string[];
}

export function StealthTable({
  stealthAddresses,
  stealthPrivateKeys,
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
            key={addr}
            kernelAddress={kernelAddresses[i]}
            stealthAddress={addr}
            stealthPrivateKey={stealthPrivateKeys[i]}
          />
        ))}
      </TableBody>
    </Table>
  );
}
