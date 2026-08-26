export function TitleStrip() {
  return (
    <div className="app-drag flex h-[38px] shrink-0 items-center border-b border-border bg-background px-4">
      <div className="flex items-center gap-2.5">
        <img src="./switchboard-icon.png" alt="" className="size-6 object-contain" draggable={false} />
        <span className="text-xs font-semibold tracking-[-0.01em] text-foreground">Switchboard</span>
        <span className="rounded-sm border border-input bg-secondary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Prototype</span>
      </div>
      <div className="ml-auto mr-[134px] flex items-center gap-2 text-[10px] text-muted-foreground/70">
        <span>Control plane simulation</span>
        <span className="size-1 rounded-full bg-input" />
        <span>v0.1.0</span>
      </div>
    </div>
  );
}
