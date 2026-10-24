import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { nextThemeMode, setThemeMode, type ThemeMode, useThemeMode } from '@/lib/theme';

const ICONS: Record<ThemeMode, typeof Monitor> = { system: Monitor, light: Sun, dark: Moon };

export function ThemeToggle() {
  const mode = useThemeMode();
  const next = nextThemeMode(mode);
  const Icon = ICONS[mode];
  const label = `Theme: ${mode} (click for ${next})`;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="size-8 px-0"
      aria-label={label}
      title={label}
      onClick={() => setThemeMode(next)}
    >
      <Icon aria-hidden />
    </Button>
  );
}
