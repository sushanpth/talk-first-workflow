import { Check, Copy, Link2, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

/** Copies text from `getText`, read at click time, and briefly shows "Copied". */
export function CopyButton({
  label,
  icon: Icon = Copy,
  getText,
  disabled,
}: {
  label: string;
  icon?: LucideIcon;
  getText: () => string;
  disabled?: boolean;
}) {
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
      disabled={disabled}
      onClick={() =>
        navigator.clipboard?.writeText(getText()).then(
          () => setCopied(true),
          () => undefined,
        )
      }
    >
      {copied ? <Check aria-hidden /> : <Icon aria-hidden />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

/** Copies the current page's URL. */
export function CopyLinkButton() {
  return <CopyButton label="Copy link" icon={Link2} getText={() => window.location.href} />;
}
