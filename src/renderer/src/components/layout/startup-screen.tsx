import { m, useReducedMotion } from 'motion/react';

interface StartupScreenProps {
  error: string | null;
}

export function StartupScreen({ error }: StartupScreenProps) {
  const reduceMotion = useReducedMotion();
  const isUnavailable = Boolean(error);

  return (
    <m.div
      className="startup-screen"
      data-state={isUnavailable ? 'unavailable' : 'initializing'}
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, pointerEvents: 'none' }}
      transition={{ duration: reduceMotion ? 0 : 0.16, ease: 'easeOut' }}
      role={isUnavailable ? 'alert' : 'status'}
      aria-label={isUnavailable ? undefined : 'Initializing control plane'}
      aria-live="polite"
      aria-busy={!isUnavailable}
    >
      <div className="startup-sequence">
        <div className="startup-mark" aria-hidden="true">
          <img className="startup-mark__layer startup-mark__layer--cyan" src="./switchboard-mark.png" alt="" draggable={false} />
          <img className="startup-mark__layer startup-mark__layer--violet" src="./switchboard-mark.png" alt="" draggable={false} />
          <img className="startup-mark__layer startup-mark__layer--magenta" src="./switchboard-mark.png" alt="" draggable={false} />
          <img className="startup-mark__layer startup-mark__layer--red" src="./switchboard-mark.png" alt="" draggable={false} />
        </div>

        {isUnavailable ? <p className="startup-sequence__error">{error}</p> : null}
      </div>
    </m.div>
  );
}
