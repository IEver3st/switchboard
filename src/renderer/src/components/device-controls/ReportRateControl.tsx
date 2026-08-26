import { Info } from 'lucide-react';
import type { ReportRateCapability } from '../../../../shared/contracts';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function ReportRateControl({
  capability,
  onChange,
}: {
  capability: ReportRateCapability;
  onChange: (value: number) => void;
}) {
  return (
    <div className="report-rate-control">
      <div className="control-heading control-heading--compact">
        <span>Polling rate</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="control-info" aria-label="About polling rate">
              <Info aria-hidden className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Higher polling can use more CPU and battery.</TooltipContent>
        </Tooltip>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <ToggleGroup
              type="single"
              value={String(capability.value)}
              disabled={!capability.writable}
              aria-label="Polling rate"
              onValueChange={(value) => value && onChange(Number(value))}
            >
              {capability.supportedRates.map((rate) => (
                <ToggleGroupItem key={rate} value={String(rate)} aria-label={`${rate} hertz`}>
                  {rate.toLocaleString()}
                  <span className="report-rate-control__unit">Hz</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </TooltipTrigger>
        {!capability.writable && capability.unavailableReason ? <TooltipContent>{capability.unavailableReason}</TooltipContent> : null}
      </Tooltip>
    </div>
  );
}
