import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatBytes, formatDuration } from "@/lib/format";
import { ChevronDown, FileArchive, FileUp, Loader2, RotateCcw, Search, ShieldCheck, UploadCloud, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { startLocalScan } from "@/scanner/client";
import { detectArchiveFormat, scanLimits } from "@/scanner/security";
import type { Evidence, ExternalPanelFinding, ExternalPanelReport, ExternalPanelResult, JailbreakFinding, JailbreakReport, JailbreakResult, ManualReview, ScanReport, ScanResult, SignatureDefinition, WorkerEvent, WorkerProgress } from "@/scanner/types";

type ProgressState = WorkerProgress & { startedAt: number };
type ResultMeta = { label: string; description: (exact: number, review: number) => string; tone: string; badge: string };
type FindingGroup = { name: string; evidence: Evidence[]; reviews: ManualReview[] };

const resultMeta: Record<ScanResult, ResultMeta> = {
  yes: { label: "WO CONFIRMADO", description: (exact, review) => `${exact} correspondência${exact === 1 ? "" : "s"} exata${exact === 1 ? "" : "s"}${review ? ` e ${review} item(ns) para verificar` : ""}.`, tone: "border-cyan-300/25 bg-cyan-300/[.07]", badge: "bg-cyan-300/15 text-cyan-100 ring-1 ring-cyan-300/25" },
  no: { label: "LIMPO", description: () => "Nenhum identificador da tabela RX7 foi encontrado nos blocos permitidos.", tone: "border-emerald-300/25 bg-emerald-300/[.07]", badge: "bg-emerald-300/15 text-emerald-100 ring-1 ring-emerald-300/25" },
  manual: { label: "VERIFICAR LOG", description: (_exact, review) => `${review} identificador${review === 1 ? "" : "es"} completo${review === 1 ? "" : "s"} sem correspondência exata.`, tone: "border-amber-300/30 bg-amber-300/[.07]", badge: "bg-amber-300/15 text-amber-100 ring-1 ring-amber-300/30" },
};

const jailbreakMeta: Record<JailbreakResult, ResultMeta> = {
  yes: { label: "JAILBREAK W.O.", description: (_exact, review) => `${review} evidência${review === 1 ? "" : "s"} técnica${review === 1 ? "" : "s"} em famílias e fontes independentes.`, tone: "border-cyan-300/25 bg-cyan-300/[.07]", badge: "bg-cyan-300/15 text-cyan-100 ring-1 ring-cyan-300/25" },
  no: { label: "JAILBREAK NÃO IDENTIFICADO", description: () => "Nenhuma combinação técnica suficiente foi achada nas fontes passivas avaliadas.", tone: "border-emerald-300/25 bg-emerald-300/[.07]", badge: "bg-emerald-300/15 text-emerald-100 ring-1 ring-emerald-300/25" },
  manual: { label: "JAILBREAK: VERIFICAR", description: (_exact, review) => `${review} sinal${review === 1 ? "" : "is"} técnico${review === 1 ? "" : "s"} isolado${review === 1 ? "" : "s"}; sem confirmação automática.`, tone: "border-amber-300/30 bg-amber-300/[.07]", badge: "bg-amber-300/15 text-amber-100 ring-1 ring-amber-300/30" },
};

const externalPanelMeta: Record<ExternalPanelResult, ResultMeta> = {
  yes: { label: "PAINEL EXTERNO W.O.", description: (_exact, review) => `${review} evidência${review === 1 ? "" : "s"} técnica${review === 1 ? "" : "s"} independente${review === 1 ? "" : "s"} encontrada${review === 1 ? "" : "s"}.`, tone: "border-cyan-300/25 bg-cyan-300/[.07]", badge: "bg-cyan-300/15 text-cyan-100 ring-1 ring-cyan-300/25" },
  no: { label: "PAINEL: SEM EVIDÊNCIA", description: () => "Nenhuma combinação técnica suficiente foi observada nas fontes passivas disponíveis. Isso não prova ausência de painel.", tone: "border-emerald-300/25 bg-emerald-300/[.07]", badge: "bg-emerald-300/15 text-emerald-100 ring-1 ring-emerald-300/25" },
  manual: { label: "PAINEL: VERIFICAR", description: (_exact, review) => `${review} sinal${review === 1 ? "" : "is"} técnico${review === 1 ? "" : "s"} encontrado${review === 1 ? "" : "s"}; sem confirmação automática.`, tone: "border-amber-300/30 bg-amber-300/[.07]", badge: "bg-amber-300/15 text-amber-100 ring-1 ring-amber-300/30" },
};

function validSignatures(value: unknown): value is SignatureDefinition[] {
  return Array.isArray(value) && value.every(item => item && typeof item === "object" && typeof (item as SignatureDefinition).id === "string" && typeof (item as SignatureDefinition).indicator === "string");
}

function firstPrefix(identifier: string) { return identifier.slice(0, Math.min(4, identifier.length)); }

function Progress({ value, onCancel }: { value: ProgressState; onCancel: () => void }) {
  return <section className="mt-8 overflow-hidden rounded-[1.4rem] border border-cyan-300/15 bg-[#10161e]"><div className="p-6"><div className="flex items-start justify-between gap-5"><div><p className="text-[10px] font-semibold tracking-[.2em] text-cyan-200/80">PROCESSAMENTO LOCAL · ETAPA {value.step}/5</p><h2 className="mt-2 text-lg font-semibold text-slate-100">{value.stage}</h2></div><span className="font-mono text-lg text-cyan-200">{typeof value.progress === "number" ? `${value.progress}%` : "…"}</span></div><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-300 transition-[width] duration-300" style={{ width: `${Math.max(2, value.progress ?? 2)}%` }} /></div><div className="mt-4 flex items-center justify-between gap-4 text-xs text-slate-500"><span><Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin text-cyan-200" />{value.bytesRead ? `${formatBytes(value.bytesRead)} processados localmente` : "Organizando o arquivo"}</span><span>{formatDuration(Date.now() - value.startedAt)}</span></div></div><div className="flex justify-end border-t border-white/[.07] px-6 py-3"><button onClick={onCancel} className="inline-flex items-center gap-2 text-xs text-slate-400 transition-colors hover:text-slate-100"><X className="h-3.5 w-3.5" />Cancelar</button></div></section>;
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="rounded-xl border border-white/[.08] bg-black/15 px-4 py-3"><p className="text-[10px] font-semibold tracking-[.18em] text-cyan-200/75">{label}</p><p className={`mt-2 break-all text-sm leading-5 text-slate-200 ${mono ? "font-mono text-[12px]" : ""}`}>{value}</p></div>;
}

function ExactFinding({ item }: { item: Evidence }) {
  const block = item.plistPath?.split(".")[0] ?? "Bloco permitido";
  return <article className="rounded-[1.25rem] border border-cyan-300/20 bg-[#10161e] p-5 shadow-[0_14px_45px_rgba(0,0,0,.18)]"><div className="border-l-2 border-cyan-300 pl-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold tracking-wide text-slate-100">{item.signature}</h3><p className="mt-1 text-xs text-slate-500">Identificador reconhecido por correspondência exata.</p></div><span className="rounded-md border border-cyan-300/30 bg-cyan-300/[.08] px-2 py-1 text-[10px] font-bold tracking-[.14em] text-cyan-100">W.O.</span></div><Collapsible><CollapsibleTrigger asChild><button className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/[.06] px-4 py-3 text-[11px] font-semibold tracking-[.12em] text-cyan-100 transition-colors hover:bg-cyan-300/[.12]"><Search className="h-3.5 w-3.5" />VER LOG DO RESULTADO</button></CollapsibleTrigger><CollapsibleContent><div className="mt-4 grid gap-3"><Info label="CATEGORIA" value={item.category} /><Info label="IDENTIFICADOR COMPLETO" value={item.value} mono /><div className="grid gap-3 sm:grid-cols-2"><Info label="LOCAL" value={block} /><Info label="MODO" value="CORRESPONDÊNCIA EXATA" /></div><Info label="DECISÃO" value={item.reason} /></div></CollapsibleContent></Collapsible></div></article>;
}

function ManualFinding({ item }: { item: ManualReview }) {
  const block = item.plistPath?.split(".")[0] ?? "Bloco permitido";
  return <article className="rounded-[1.25rem] border border-amber-300/25 bg-[#10161e] p-5 shadow-[0_14px_45px_rgba(0,0,0,.18)]"><div className="border-l-2 border-amber-300 pl-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold tracking-wide text-slate-100">Identificador para verificar</h3><p className="mt-1 text-xs text-slate-500">Nenhuma assinatura exata foi aplicada automaticamente.</p></div><span className="rounded-md border border-amber-300/30 bg-amber-300/[.08] px-2 py-1 text-[10px] font-bold tracking-[.14em] text-amber-100">VERIFICAR</span></div><Collapsible><CollapsibleTrigger asChild><button className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300/25 bg-amber-300/[.06] px-4 py-3 text-[11px] font-semibold tracking-[.12em] text-amber-100 transition-colors hover:bg-amber-300/[.12]"><Search className="h-3.5 w-3.5" />VER LOG DO RESULTADO</button></CollapsibleTrigger><CollapsibleContent><div className="mt-4 grid gap-3"><Info label="IDENTIFICADOR COMPLETO" value={item.identifier} mono /><div className="grid gap-3 sm:grid-cols-2"><Info label="PREFIXO" value={firstPrefix(item.identifier)} mono /><Info label="LOCAL" value={block} /></div><Info label="DECISÃO" value={item.reason} /></div></CollapsibleContent></Collapsible></div></article>;
}

function groupsFrom(report: ScanReport): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();
  for (const item of report.evidence) {
    const existing = groups.get(item.category) ?? { name: item.category, evidence: [], reviews: [] };
    existing.evidence.push(item);
    groups.set(item.category, existing);
  }
  if (report.manualReviews.length) groups.set("IDENTIFICADORES PARA VERIFICAR", { name: "IDENTIFICADORES PARA VERIFICAR", evidence: [], reviews: report.manualReviews });
  return Array.from(groups.values());
}

function FindingCategory({ group }: { group: FindingGroup }) {
  const total = group.evidence.length + group.reviews.length;
  const isManual = group.evidence.length === 0;
  const tint = isManual ? "border-amber-300/25 hover:border-amber-300/45" : "border-cyan-300/25 hover:border-cyan-300/45";
  const badge = isManual ? "bg-amber-300/10 text-amber-100" : "bg-cyan-300/10 text-cyan-100";
  return <Collapsible><section className={`overflow-hidden rounded-xl border bg-[#0e141c] ${tint}`}><CollapsibleTrigger asChild><button className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"><span className="text-xs font-semibold tracking-[.15em] text-slate-100">{group.name}</span><span className="flex items-center gap-3"><span className={`min-w-7 rounded-md px-2 py-1 text-center text-[10px] font-bold ${badge}`}>{total}</span><ChevronDown className="h-4 w-4 text-slate-500" /></span></button></CollapsibleTrigger><CollapsibleContent><div className="space-y-3 border-t border-white/[.07] p-4">{group.evidence.map(item => <ExactFinding key={item.signatureId} item={item} />)}{group.reviews.map((item, index) => <ManualFinding key={`${item.identifier}-${index}`} item={item} />)}</div></CollapsibleContent></section></Collapsible>;
}

function JailbreakFindingCard({ item }: { item: JailbreakFinding }) {
  return <article className="rounded-[1.25rem] border border-cyan-300/20 bg-[#10161e] p-5 shadow-[0_14px_45px_rgba(0,0,0,.18)]"><div className="border-l-2 border-cyan-300 pl-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold tracking-wide text-slate-100">Evidência técnica de Jailbreak</h3><p className="mt-1 text-xs text-slate-500">Sinal passivo encontrado em fonte específica do SYSdiagnose.</p></div><span className="rounded-md border border-cyan-300/30 bg-cyan-300/[.08] px-2 py-1 text-[10px] font-bold tracking-[.14em] text-cyan-100">W.O.</span></div><Collapsible><CollapsibleTrigger asChild><button className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/[.06] px-4 py-3 text-[11px] font-semibold tracking-[.12em] text-cyan-100 transition-colors hover:bg-cyan-300/[.12]"><Search className="h-3.5 w-3.5" />VER LOG DO RESULTADO</button></CollapsibleTrigger><CollapsibleContent><div className="mt-4 grid gap-3"><Info label="SINAL TÉCNICO" value={item.label} /><div className="grid gap-3 sm:grid-cols-2"><Info label="FAMÍLIA" value={item.family} /><Info label="FONTE" value={item.sourceKind} /></div><Info label="ARQUIVO" value={item.sourcePath} mono /></div></CollapsibleContent></Collapsible></div></article>;
}

function JailbreakSummary({ jailbreak }: { jailbreak: JailbreakReport }) {
  const meta = jailbreakMeta[jailbreak.status];
  return <section className={`mt-5 rounded-[1.5rem] border p-6 text-center sm:p-8 ${meta.tone}`}><p className="text-[10px] font-semibold tracking-[.22em] text-slate-400">ANÁLISE DE JAILBREAK</p><div className="mt-5 flex justify-center"><span className={`rounded-full px-4 py-2 text-xs font-bold tracking-[.14em] ${meta.badge}`}>{meta.label}</span></div><p className="mx-auto mt-5 max-w-md text-sm leading-6 text-slate-300">{jailbreak.summary}</p><p className="mt-3 text-xs text-slate-500">{jailbreak.sourcesReviewed} fonte{jailbreak.sourcesReviewed === 1 ? "" : "s"} técnica{jailbreak.sourcesReviewed === 1 ? "" : "s"} avaliada{jailbreak.sourcesReviewed === 1 ? "" : "s"} localmente.</p>{jailbreak.findings.length > 0 && <Collapsible><CollapsibleTrigger asChild><button className="mt-5 inline-flex items-center gap-2 text-[11px] font-semibold tracking-[.12em] text-slate-200 hover:text-cyan-100"><ChevronDown className="h-3.5 w-3.5" />EVIDÊNCIAS TÉCNICAS</button></CollapsibleTrigger><CollapsibleContent><div className="mt-5 space-y-3 text-left">{jailbreak.findings.map(item => <JailbreakFindingCard key={`${item.id}-${item.sourcePath}`} item={item} />)}</div></CollapsibleContent></Collapsible>}</section>;
}

function ExternalPanelFindingCard({ item }: { item: ExternalPanelFinding }) {
  return <article className="rounded-[1.25rem] border border-amber-300/25 bg-[#10161e] p-5 shadow-[0_14px_45px_rgba(0,0,0,.18)]"><div className="border-l-2 border-amber-300 pl-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold tracking-wide text-slate-100">Sinal técnico de painel externo</h3><p className="mt-1 text-xs text-slate-500">Triagem passiva; precisa de conferência antes de qualquer conclusão.</p></div><span className="rounded-md border border-amber-300/30 bg-amber-300/[.08] px-2 py-1 text-[10px] font-bold tracking-[.14em] text-amber-100">VERIFICAR</span></div><Collapsible><CollapsibleTrigger asChild><button className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300/25 bg-amber-300/[.06] px-4 py-3 text-[11px] font-semibold tracking-[.12em] text-amber-100 transition-colors hover:bg-amber-300/[.12]"><Search className="h-3.5 w-3.5" />VER LOG DO RESULTADO</button></CollapsibleTrigger><CollapsibleContent><div className="mt-4 grid gap-3"><Info label="SINAL TÉCNICO" value={item.label} /><Info label="IDENTIFICADOR" value={item.indicator} mono /><div className="grid gap-3 sm:grid-cols-2"><Info label="FAMÍLIA" value={item.family} /><Info label="FONTE" value={item.sourceKind} /></div><Info label="ARQUIVO" value={item.sourcePath} mono /></div></CollapsibleContent></Collapsible></div></article>;
}

function ExternalPanelSummary({ externalPanel }: { externalPanel: ExternalPanelReport }) {
  const meta = externalPanelMeta[externalPanel.status];
  return <section className={`mt-5 rounded-[1.5rem] border p-6 text-center sm:p-8 ${meta.tone}`}><p className="text-[10px] font-semibold tracking-[.22em] text-slate-400">TRIAGEM DE PAINEL EXTERNO</p><div className="mt-5 flex justify-center"><span className={`rounded-full px-4 py-2 text-xs font-bold tracking-[.14em] ${meta.badge}`}>{meta.label}</span></div><p className="mx-auto mt-5 max-w-md text-sm leading-6 text-slate-300">{externalPanel.summary}</p><div className="mx-auto mt-4 max-w-md rounded-xl border border-white/[.08] bg-black/15 px-4 py-3 text-left"><p className="text-[10px] font-semibold tracking-[.14em] text-cyan-200/75">COBERTURA PASSIVA · {externalPanel.coverage.status === "available" ? "BASE DISPONÍVEL" : "LIMITADA"}</p><p className="mt-2 text-xs leading-5 text-slate-400">{externalPanel.coverage.note}</p></div><p className="mt-3 text-xs text-slate-500">{externalPanel.sourcesReviewed} fonte{externalPanel.sourcesReviewed === 1 ? "" : "s"} técnica{externalPanel.sourcesReviewed === 1 ? "" : "s"} avaliada{externalPanel.sourcesReviewed === 1 ? "" : "s"} localmente.</p>{externalPanel.findings.length > 0 && <Collapsible><CollapsibleTrigger asChild><button className="mt-5 inline-flex items-center gap-2 text-[11px] font-semibold tracking-[.12em] text-slate-200 hover:text-amber-100"><ChevronDown className="h-3.5 w-3.5" />SINAIS TÉCNICOS</button></CollapsibleTrigger><CollapsibleContent><div className="mt-5 space-y-3 text-left">{externalPanel.findings.map(item => <ExternalPanelFindingCard key={`${item.id}-${item.sourcePath}`} item={item} />)}</div></CollapsibleContent></Collapsible>}</section>;
}

function ResultSummary({ report }: { report: ScanReport }) {
  const meta = resultMeta[report.result];
  const exact = report.evidence.length;
  const review = report.manualReviews.length;
  const groups = groupsFrom(report);
  return <><section className={`mt-7 rounded-[1.5rem] border p-6 text-center sm:p-8 ${meta.tone}`}><p className="text-[10px] font-semibold tracking-[.22em] text-slate-400">O QUE FOI ENCONTRADO</p><div className="mt-5 flex justify-center"><span className={`rounded-full px-4 py-2 text-xs font-bold tracking-[.14em] ${meta.badge}`}>{meta.label}</span></div><p className="mx-auto mt-5 max-w-md text-sm leading-6 text-slate-300">{meta.description(exact, review)}</p></section><JailbreakSummary jailbreak={report.jailbreak} /><ExternalPanelSummary externalPanel={report.externalPanel} />{groups.length > 0 && <section className="mt-5 space-y-3"><p className="px-1 text-[10px] font-semibold tracking-[.18em] text-slate-500">CATEGORIAS ENCONTRADAS</p>{groups.map(group => <FindingCategory key={group.name} group={group} />)}</section>}</>;
}

export default function PublicDiagnose() {
  const input = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const startedAt = useRef<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<"tar.gz" | "zip" | null>(null);
  const [signatures, setSignatures] = useState<SignatureDefinition[]>([]);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => { void fetch(`${import.meta.env.BASE_URL}data/signatures.json`).then(response => response.json()).then(data => { if (!validSignatures(data)) throw new Error(); setSignatures(data); }).catch(() => toast.error("Não foi possível carregar a tabela RX7.")); return () => cancelRef.current?.(); }, []);
  const reset = () => { cancelRef.current?.(); cancelRef.current = null; startedAt.current = null; setFile(null); setFormat(null); setProgress(null); setReport(null); setDragging(false); if (input.current) input.current.value = ""; };
  const selectFile = async (candidate?: File) => { if (!candidate) return; try { if (!candidate.size || candidate.size > scanLimits.maxUploadBytes) throw new Error("Selecione um arquivo entre 1 byte e 350 MB."); setFormat(await detectArchiveFormat(candidate)); setFile(candidate); setReport(null); } catch (error) { toast.error(error instanceof Error ? error.message : "Arquivo inválido."); } };
  const onEvent = (event: WorkerEvent) => { if (event.type === "progress") setProgress({ ...event, startedAt: startedAt.current ?? Date.now() }); else if (event.type === "complete") { startedAt.current = null; setProgress(null); setReport(event.report); } else if (event.type === "error") { startedAt.current = null; setProgress(null); toast.error(event.message); } else { startedAt.current = null; setProgress(null); toast.message("Análise cancelada."); } };
  const start = () => { if (!file || !signatures.length) return toast.error("Aguarde a tabela RX7 carregar."); const now = Date.now(); startedAt.current = now; setProgress({ type: "progress", step: 1, stage: "Preparando a análise local", progress: 0, processedFileCount: 0, relevantFileCount: 0, bytesRead: 0, totalBytes: file.size, startedAt: now }); cancelRef.current = startLocalScan(file, signatures, onEvent); };
  const cancel = () => { cancelRef.current?.(); cancelRef.current = null; startedAt.current = null; setProgress(null); };

  return <main className="min-h-screen bg-[#080b10] px-4 py-8 text-slate-100 sm:px-6 sm:py-12"><div className="mx-auto max-w-2xl"><header className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10"><ShieldCheck className="h-5 w-5 text-cyan-200" /></div><p className="text-sm font-bold tracking-[.22em] text-slate-100">RX7</p></div><span className="text-[10px] font-medium tracking-[.15em] text-slate-500">/ RX7</span></header>{!report ? <section className="py-16 sm:py-24">{progress ? <Progress value={progress} onCancel={cancel} /> : <><input ref={input} type="file" accept=".tar.gz,.tgz,.zip" className="hidden" onChange={event => void selectFile(event.target.files?.[0])} /><button onClick={() => input.current?.click()} onDragEnter={event => { event.preventDefault(); setDragging(true); }} onDragOver={event => event.preventDefault()} onDragLeave={event => { event.preventDefault(); setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); void selectFile(event.dataTransfer.files?.[0]); }} className={`flex min-h-64 w-full flex-col items-center justify-center rounded-[1.75rem] border border-dashed px-6 transition-colors ${dragging ? "border-cyan-200 bg-cyan-300/[.08]" : "border-slate-700 bg-[#10161e] hover:border-cyan-300/55"}`}><div className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-300/[.09] text-cyan-200"><UploadCloud className="h-6 w-6" /></div><p className="mt-5 text-base font-semibold text-slate-100">Enviar Sysdiagnose</p><p className="mt-2 text-xs text-slate-500">.tar.gz · .tgz · .zip</p></button>{file && <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/[.08] bg-[#10161e] px-4 py-3"><FileArchive className="h-4 w-4 text-cyan-200" /><div className="min-w-0 flex-1"><p className="truncate text-sm text-slate-200">{file.name}</p><p className="mt-0.5 text-xs text-slate-500">{formatBytes(file.size)} · {format === "zip" ? "ZIP" : "TAR.GZ"}</p></div><button onClick={reset} className="text-xs text-slate-500 hover:text-slate-200">Remover</button></div>}<Button disabled={!file || !signatures.length} onClick={start} className="mt-5 w-full bg-cyan-300 py-6 text-sm font-semibold text-slate-950 hover:bg-cyan-200"><FileUp className="mr-2 h-4 w-4" />Iniciar análise</Button></>}</section> : <section className="py-12 sm:py-16"><p className="text-[10px] font-semibold tracking-[.22em] text-cyan-200/80">RELATÓRIO LOCAL</p><p className="mt-2 text-sm text-slate-500">{report.fileName} · {formatDuration(report.durationMs)}</p><ResultSummary report={report} /><button onClick={reset} className="mt-9 inline-flex items-center gap-2 text-xs text-slate-500 transition-colors hover:text-slate-200"><RotateCcw className="h-3.5 w-3.5" />Novo envio</button></section>}<footer className="border-t border-white/[.07] py-5 text-center text-[10px] tracking-[.14em] text-slate-600">DESENVOLVEDOR / RX7 <span className="px-1.5 text-slate-700">·</span> AUXILIAR DK</footer></div></main>;
}
