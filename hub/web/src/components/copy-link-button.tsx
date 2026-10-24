import { Check, Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

/** Copies the current page's URL. */
export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        navigator.clipboard?.writeText(window.location.href).then(
          () => setCopied(true),
          () => undefined,
        )
      }
    >
      {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  );
}
