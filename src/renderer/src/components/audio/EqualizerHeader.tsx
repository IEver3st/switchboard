import type { ReactNode } from 'react';
import { Switch } from '@/components/ui/switch';

export function EqualizerHeader({
  headingId,
  checked,
  disabled,
  pending,
  tools,
  onCheckedChange,
}: {
  headingId: string;
  checked: boolean;
  disabled?: boolean;
  pending?: boolean;
  tools?: ReactNode;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <header className="equalizer-header">
      <div className="equalizer-header__identity">
        <h2 id={headingId}>Equalizer</h2>
        <label className="equalizer-header__state">
          <Switch
            checked={checked}
            disabled={disabled || pending}
            aria-label="Equalizer"
            onCheckedChange={onCheckedChange}
          />
        </label>
      </div>
      {tools ? <div className="equalizer-header__tools">{tools}</div> : null}
    </header>
  );
}
