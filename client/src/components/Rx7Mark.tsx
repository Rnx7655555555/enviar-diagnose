import { ShieldCheck } from "lucide-react";

export function Rx7Mark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 shadow-[0_0_0_1px_rgba(34,211,238,.04)]">
        <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </div>
      {!compact && <div className="min-w-0"><p className="font-semibold tracking-[0.18em] text-slate-100">RX7</p><p className="mt-0.5 truncate text-[10px] tracking-[0.12em] text-slate-500">SYS DIAGNOSE</p></div>}
    </div>
  );
}
