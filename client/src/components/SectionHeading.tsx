export function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="flex flex-col gap-4 border-b border-white/[0.07] pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">{eyebrow ?? "RX7 OPERATIONS"}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{description}</p>}</div>{action}</div>;
}
