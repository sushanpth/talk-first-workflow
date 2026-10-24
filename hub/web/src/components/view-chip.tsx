import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ViewChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      aria-pressed={active}
      className={cn(active && 'ring-1 ring-border')}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
