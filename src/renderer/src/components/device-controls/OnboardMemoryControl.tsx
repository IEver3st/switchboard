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
    <div className="onboard-memory-control">
      <div className="onboard-memory-control__heading">
        <div>
          <span>Onboard memory</span>
          <p>Use settings stored directly on the mouse.</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Switch
                checked={capability.enabled}
                disabled={!capability.writable}
                onCheckedChange={onChange}
                aria-label="Onboard memory"
              />
            </span>
          </TooltipTrigger>
          {!capability.writable ? <TooltipContent>Onboard memory mode is unavailable for this connection.</TooltipContent> : null}
        </Tooltip>
      </div>
      {capability.enabled && capability.activeProfile ? (
        <div className="onboard-memory-control__profile">
          <span>Profile</span>
          <strong>{formatProfile(capability.activeProfile)}</strong>
        </div>
      ) : null}
    </div>
  );
}

function formatProfile(value: string | undefined): string {
  if (!value) return 'Active profile';
  return value.replace(/^profile[_\s-]*/i, 'Profile ').replaceAll('_', ' ');
}
