import type { ReactNode } from 'react';

export function AudioWorkbenchHeader({ title, subtitle, tools }: { title: string; subtitle: string; tools?: ReactNode }) {
  return (
    <header className="audio-header">
      <div className="audio-header__identity">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {tools ? <div className="audio-header__tools">{tools}</div> : null}
    </header>
  );
}
