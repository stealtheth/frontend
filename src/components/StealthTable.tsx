import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Copy } from 'lucide-react';
import { useKernelAddresses } from '@/hooks/useKernelAddresses';

interface StealthTableProps {
  stealthAddresses: string[];
  stealthPrivateKeys: string[];
}

export function StealthTable({ stealthAddresses, stealthPrivateKeys }: StealthTableProps) {

  const kernelAddresses = useKernelAddresses(stealthAddresses)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kernel Address</TableHead>
          <TableHead>Stealth Address</TableHead>
          <TableHead>Stealth Private Key</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stealthAddresses.map((address, index) => (
          <TableRow key={address}>
            <TableCell>{kernelAddresses[index]}</TableCell>
            <TableCell>{address}</TableCell>
            <TableCell
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => navigator.clipboard.writeText(stealthPrivateKeys[index])}
            >
              <div className="flex items-center gap-2">
                {stealthPrivateKeys[index].slice(0, 6)}...{stealthPrivateKeys[index].slice(-4)}
                <Copy className="h-4 w-4" />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}