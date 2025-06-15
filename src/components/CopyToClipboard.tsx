import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Eye, EyeOff } from 'lucide-react';

interface CopyToClipboardProps {
  value: string;
  truncateLength?: number;
}

export function CopyToClipboard({ value, truncateLength = 6 }: CopyToClipboardProps) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncatedValue = `${value.slice(0, truncateLength)}…${value.slice(-4)}`;

  return (
    <div className="flex items-center gap-2">
      <span>{visible ? value : truncatedValue}</span>
      <Button variant="ghost" size="icon" onClick={() => setVisible(!visible)}>
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
      <Button variant="ghost" size="icon" onClick={handleCopy}>
        <Copy className="h-4 w-4" />
      </Button>
      {copied && <span className="text-sm text-muted-foreground">Copied!</span>}
    </div>
  );
} 