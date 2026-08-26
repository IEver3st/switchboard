export function TitleStrip() {
  return (
    <div className="app-drag flex h-[38px] shrink-0 items-center border-b border-[var(--border)] bg-[#0d0f12] px-4">
      <div className="flex items-center gap-2.5">
        <div className="relative size-5 rounded-[5px] border border-[#353b44] bg-[#171a1f]">
          <span className="absolute left-[5px] top-[5px] h-[2px] w-[8px] rounded-full bg-[#e9eaec]" />
          <span className="absolute left-[5px] top-[9px] h-[6px] w-[2px] rounded-full bg-[var(--accent)]" />
          <span className="absolute left-[9px] top-[9px] h-[2px] w-[6px] rounded-full bg-[var(--accent)]" />
        </div>
        <span className="text-[12px] font-semibold tracking-[-0.01em] text-[#d9dce0]">Switchboard</span>
        <span className="rounded-[4px] border border-[#343943] bg-[#171a1f] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#747d88]">Prototype</span>
      </div>
      <div className="ml-auto mr-[134px] flex items-center gap-2 text-[10px] text-[#5e6671]">
        <span>Control plane simulation</span>
        <span className="size-1 rounded-full bg-[#343a43]" />
        <span>v0.1.0</span>
      </div>
    </div>
  );
}
