export function TitleStrip() {
  return (
    <div className="app-drag flex h-[38px] shrink-0 items-center border-b border-border bg-background px-4">
      <div className="flex items-center gap-2.5">
        <img src="./switchboard-icon.png" alt="" className="size-6 object-contain" draggable={false} />
        <span className="text-xs font-semibold tracking-[-0.01em] text-foreground">Switchboard</span>
      </div>
    </div>
  );
}
