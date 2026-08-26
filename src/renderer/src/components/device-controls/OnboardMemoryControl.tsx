import { HardDrive, Info } from 'lucide-react';
import type { OnboardMemoryCapability } from '../../../../shared/contracts';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function OnboardMemoryControl({
  capability,
  onChange,
}: {
  capability: OnboardMemoryCapability;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="device-setting-row">
      <HardDrive aria-hidden className="device-setting-row__icon" />
      <div className="device-setting-row__copy">
        <div>
          <span>Onboard memory</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="control-info" aria-label="About onboard memory">
                <Info aria-hidden className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Stores compatible settings directly on the mouse.</TooltipContent>
          </Tooltip>
        </div>
        <p>{capability.enabled ? `Using ${formatProfile(capability.activeProfile)}` : 'Store compatible settings directly on the mouse.'}</p>
      </div>
      <Switch
        checked={capability.enabled}
        disabled={!capability.writable}
        onCheckedChange={onChange}
        aria-label="Onboard memory"
      />
    </div>
  );
}

function formatProfile(value: string | undefined): string {
  if (!value) return 'an onboard profile.';
  return `${value.toLowerCase().replace('_', ' ')}.`;
}
