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
      aria-live="polite"
      aria-busy={!isUnavailable}
    >
      <div className="startup-sequence">
        <svg className="startup-console" viewBox="0 0 368 196" aria-hidden="true">
          <g className="startup-console__controls">
            <path className="startup-console__tick" d="M84 34 H92 M84 54 H92 M84 74 H92 M84 94 H92 M84 114 H92" />
            <path className="startup-console__tick" d="M160 34 H168 M160 54 H168 M160 74 H168 M160 94 H168 M160 114 H168" />
            <path className="startup-console__tick" d="M236 34 H244 M236 54 H244 M236 74 H244 M236 94 H244 M236 114 H244" />

            <line className="startup-console__rail" x1="104" y1="28" x2="104" y2="124" />
            <line className="startup-console__rail" x1="180" y1="28" x2="180" y2="124" />
            <line className="startup-console__rail" x1="256" y1="28" x2="256" y2="124" />

            <g className="startup-console__fader startup-console__fader--one">
              <rect className="startup-console__knob" x="91" y="47" width="26" height="18" rx="4" />
              <line className="startup-console__knob-mark" x1="98" y1="56" x2="110" y2="56" />
            </g>
            <g className="startup-console__fader startup-console__fader--two">
              <rect className="startup-console__knob" x="167" y="78" width="26" height="18" rx="4" />
              <line className="startup-console__knob-mark" x1="174" y1="87" x2="186" y2="87" />
            </g>
            <g className="startup-console__fader startup-console__fader--three">
              <rect className="startup-console__knob" x="243" y="59" width="26" height="18" rx="4" />
              <line className="startup-console__knob-mark" x1="250" y1="68" x2="262" y2="68" />
            </g>
          </g>

          <g className="startup-console__routes">
            <path className="startup-console__route-bed" d="M104 136 V150 H166" />
            <path className="startup-console__route-bed" d="M180 136 V164 H226" />
            <path className="startup-console__route-bed" d="M256 136 V150 H298 Q316 150 316 132 V106 H342" />
            <path className="startup-console__route-bed" d="M166 150 H298" />
            <path className="startup-console__route-bed" d="M226 164 H306 Q328 164 328 142 V106" />

            <path className="startup-console__route startup-console__route--one" pathLength="1" d="M104 136 V150 H298" />
            <path className="startup-console__route startup-console__route--two" pathLength="1" d="M180 136 V164 H306 Q328 164 328 142 V106" />
            <path className="startup-console__route startup-console__route--three" pathLength="1" d="M256 136 V150 H298 Q316 150 316 132 V106 H342" />

            <circle className="startup-console__port" cx="104" cy="136" r="3" />
            <circle className="startup-console__port" cx="180" cy="136" r="3" />
            <circle className="startup-console__port" cx="256" cy="136" r="3" />
            <circle className="startup-console__output" cx="342" cy="106" r="4" />

            {!isUnavailable && !reduceMotion ? (
              <circle className="startup-console__pulse" r="3" cx="0" cy="0">
                <animateMotion
                  dur="2.8s"
                  repeatCount="indefinite"
                  path="M104 136 V150 H298 Q316 150 316 132 V106 H342"
                  keyPoints="0;0;0;1;1"
                  keyTimes="0;0.51;0.54;0.82;1"
                  calcMode="linear"
                />
                <animate
                  attributeName="opacity"
                  dur="2.8s"
                  repeatCount="indefinite"
                  values="0;0;1;1;0;0"
                  keyTimes="0;0.51;0.54;0.77;0.82;1"
                />
              </circle>
            ) : null}
          </g>
        </svg>

        <div className="startup-sequence__copy">
          <strong>Switchboard</strong>
          <span className="startup-sequence__status">
            <i aria-hidden="true" />
            {isUnavailable ? 'Control plane unavailable' : 'Initializing control plane'}
          </span>
        </div>

        {isUnavailable ? <p className="startup-sequence__error">{error}</p> : null}
      </div>
    </m.div>
  );
}
