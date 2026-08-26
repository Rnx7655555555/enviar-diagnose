import { cn } from "@/lib/utils";

const styles = {
  clean: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  suspicious: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  evidence: "border-rose-400/25 bg-rose-400/10 text-rose-100",
  queued: "border-slate-600 bg-slate-800 text-slate-300",
  validating: "border-cyan-400/25 bg-cyan-400/10 text-cyan-100",
  extracting: "border-cyan-400/25 bg-cyan-400/10 text-cyan-100",
  analyzing: "border-cyan-400/25 bg-cyan-400/10 text-cyan-100",
  completed: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  failed: "border-rose-400/25 bg-rose-400/10 text-rose-100",
  cancelled: "border-slate-600 bg-slate-800 text-slate-300",
  informativo: "border-sky-400/25 bg-sky-400/10 text-sky-100",
  baixa: "border-slate-500/30 bg-slate-500/10 text-slate-200",
  media: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  alta: "border-orange-300/25 bg-orange-300/10 text-orange-100",
  confirmada: "border-rose-400/25 bg-rose-400/10 text-rose-100",
};

const labels: Record<string, string> = { clean: "LIMPO", suspicious: "SUSPEITO", evidence: "EVIDÊNCIAS ENCONTRADAS", queued: "AGUARDANDO", validating: "VALIDANDO", extracting: "EXTRAINDO", analyzing: "ANALISANDO", completed: "CONCLUÍDO", failed: "FALHOU", cancelled: "CANCELADO", informativo: "INFORMATIVO", baixa: "BAIXA", media: "MÉDIA", alta: "ALTA", confirmada: "CONFIRMADA" };

export function StatusPill({ value, className }: { value: string | null | undefined; className?: string }) {
  const safeValue = value ?? "queued";
  return <span className={cn("inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.1em]", styles[safeValue as keyof typeof styles] ?? styles.queued, className)}>{labels[safeValue] ?? safeValue.toUpperCase()}</span>;
}
