import { useState, type CSSProperties } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';

interface StartupScreenProps {
  error: string | null;
}

export function StartupScreen({ error }: StartupScreenProps) {
  const reduceMotion = useReducedMotion();
  // performance.now() counts from navigation start, so the CSS show-delay,
  // spinner phase, and stall notice are timed from window load, not React mount.
  // All startup timing lives in CSS; nothing here outlives this component.
  const [style] = useState(() => ({ '--startup-elapsed': `${Math.round(performance.now())}ms` }) as CSSProperties);
  const reload = () => window.location.reload();

  return (
    <m.div
      className="startup-screen"
      data-state={error ? 'unavailable' : 'initializing'}
      style={style}
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, pointerEvents: 'none' }}
      transition={{ duration: reduceMotion ? 0 : 0.12, ease: 'easeOut' }}
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
      aria-busy={!error}
    >
      <div className="startup-screen__drag app-drag" aria-hidden="true" />
      <div className="startup-sequence">
        <img className="startup-mark" src="./switchboard-mark.png" alt="" draggable={false} />
        {error ? (
          <div className="startup-sequence__message">
            <p className="startup-sequence__title">Switchboard couldn’t start</p>
            <p className="startup-sequence__detail">{error}</p>
            <Button className="startup-sequence__action no-drag" size="sm" onClick={reload}>Reload</Button>
          </div>
        ) : (
          <div className="startup-sequence__stack">
            <div className="startup-sequence__message startup-sequence__message--progress">
              <p className="startup-sequence__title">
                <span className="startup-spinner" aria-hidden="true" />
                Starting Switchboard
              </p>
              <p className="startup-sequence__detail">Loading saved settings</p>
            </div>
            {/* Readiness normally lands well inside the 1,500 ms startup budget.
                If it never does, CSS swaps in this notice instead of spinning forever. */}
            <div className="startup-sequence__message startup-sequence__message--stalled">
              <p className="startup-sequence__title">Switchboard is taking longer than usual</p>
              <p className="startup-sequence__detail">Saved settings haven’t loaded yet.</p>
              <Button className="startup-sequence__action no-drag" size="sm" onClick={reload}>Reload</Button>
            </div>
          </div>
        )}
      </div>
    </m.div>
  );
}
