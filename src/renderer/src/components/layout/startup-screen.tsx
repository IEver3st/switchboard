import { m, useReducedMotion } from 'motion/react';

interface StartupScreenProps {
  error: string | null;
  exiting: boolean;
  onExitComplete(): void;
}

const routePaths = [
  'M8 10 H72 L88 26 H212',
  'M8 26 H212',
  'M8 42 H72 L88 26',
] as const;

export function StartupScreen({ error, exiting, onExitComplete }: StartupScreenProps) {
  const reduceMotion = useReducedMotion();
  const isUnavailable = Boolean(error);

  return (
    <m.div
      className="startup-screen"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.16, ease: 'easeOut' }}
      onAnimationComplete={() => {
        if (exiting) onExitComplete();
      }}
      role={isUnavailable ? 'alert' : 'status'}
      aria-live="polite"
      aria-busy={!isUnavailable}
    >
      <div className="startup-sequence">
        <m.img
          src="./switchboard-icon.png"
          alt=""
          className="startup-sequence__mark"
          draggable={false}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
        />

        <svg className="startup-route" viewBox="0 0 220 52" aria-hidden="true">
          {routePaths.map((path) => (
            <path key={`track-${path}`} className="startup-route__track" d={path} pathLength="1" />
          ))}
          {!isUnavailable ? routePaths.map((path, index) => (
            <m.path
              key={`signal-${path}`}
              className="startup-route__signal"
              d={path}
              initial={reduceMotion ? { pathLength: 1, opacity: 0.72 } : { pathLength: 0, opacity: 0 }}
              animate={reduceMotion ? { pathLength: 1, opacity: 0.72 } : {
                pathLength: [0, 1, 1],
                opacity: [0.25, 1, 0.25],
              }}
              transition={reduceMotion ? { duration: 0 } : {
                duration: 1.18,
                delay: index * 0.08,
                ease: 'easeInOut',
                repeat: Infinity,
                repeatDelay: 0.16,
                times: [0, 0.68, 1],
              }}
            />
          )) : null}
          <circle className="startup-route__source" cx="8" cy="10" r="2.5" />
          <circle className="startup-route__source" cx="8" cy="26" r="2.5" />
          <circle className="startup-route__source" cx="8" cy="42" r="2.5" />
          <m.circle
            className={isUnavailable ? 'startup-route__destination is-unavailable' : 'startup-route__destination'}
            cx="212"
            cy="26"
            r="3"
            initial={reduceMotion ? false : { opacity: 0.35, scale: 0.82 }}
            animate={reduceMotion || isUnavailable ? { opacity: 1, scale: 1 } : {
              opacity: [0.35, 1, 0.35],
              scale: [0.82, 1, 0.82],
            }}
            transition={reduceMotion || isUnavailable ? { duration: 0 } : {
              duration: 1.18,
              delay: 0.36,
              ease: 'easeInOut',
              repeat: Infinity,
              repeatDelay: 0.16,
            }}
          />
        </svg>

        <div className="startup-sequence__copy">
          <strong>Switchboard</strong>
          <span>{isUnavailable ? 'Control plane unavailable' : 'Starting control plane'}</span>
        </div>

        {isUnavailable ? <p className="startup-sequence__error">{error}</p> : null}
      </div>
    </m.div>
  );
}
