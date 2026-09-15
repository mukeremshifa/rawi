import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';

import { useTheme, type ThemeChoice } from './theme.tsx';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.tsx';

/**
 * Light / dark / system, as three states rather than a two-state switch.
 *
 * A binary toggle has to pick an initial value before it knows the OS
 * preference, and "system" is the honest default — it is also the one most
 * people actually want, because it follows the machine at sunset.
 */
const OPTIONS: { value: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <SunIcon /> },
  { value: 'system', label: 'System', icon: <MonitorIcon /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon /> },
];

export function ThemeToggle() {
  const { choice, setChoice } = useTheme();

  return (
    <ToggleGroup
      type="single"
      value={choice}
      onValueChange={(value) => value && setChoice(value as ThemeChoice)}
      aria-label="Theme"
    >
      {OPTIONS.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-label={option.label}
          className="[&>svg]:size-3.5"
        >
          {option.icon}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
