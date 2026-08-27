import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatBytes, formatDuration } from "@/lib/format";
import { ChevronDown, Download, FileArchive, FileJson2, FileText, FileUp, Loader2, RotateCcw, ShieldCheck, UploadCloud, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { startLocalScan } from "@/scanner/client";
import { exportJson, exportPdf, exportTxt } from "@/scanner/export";
import { detectArchiveFormat, scanLimits } from "@/scanner/security";
import type { ManualReview, ScanReport, ScanResult, SignatureDefinition, WorkerEvent, WorkerProgress } from "@/scanner/types";

type ProgressState = WorkerProgress & { startedAt: number };
type ResultMeta = { label: string; description: (exact: number, review: number) => string; tone: string; badge: string };

const resultMeta: Record<ScanResult, ResultMeta> = {
  yes: { label: "WO CONFIRMADO", description: (exact, review) => `${exact} correspondência${exact === 1 ? "" : "s"} exata${exact === 1 ? "" : "s"}${review ? ` e ${review} item(ns) para verificar` : ""}.`, tone: "border-emerald-300/25 bg-emerald-300/[.07]", badge: "bg-emerald-300/15 text-emerald-100 ring-1 ring-emerald-300/25" },
  no: { label: "LIMPO", description: () => "Nenhum identificador da tabela RX7 foi encontrado nos blocos permitidos.", tone: "border-sky-300/20 bg-sky-300/[.05]", badge: "bg-sky-300/15 text-sky-100 ring-1 ring-sky-300/25" },
  manual: { label: "VERIFICAR LOG", description: (_exact, review) => `${review} identificador${review === 1 ? "" : "es"} completo${review === 1 ? "" : "s"} sem correspondência exata.`, tone: "border-amber-300/30 bg-amber-300/[.07]", badge: "bg-amber-300/15 text-amber-100 ring-1 ring-amber-300/30" },
};

function validSignatures(value: unknown): value is SignatureDefinition[] {
  return Array.isArray(value) && value.every(item => item && typeof item === "object" && typeof (item as SignatureDefinition).id === "string" && typeof (item as SignatureDefinition).indicator === "string");
}

function firstPrefix(identifier: string) { return identifier.slice(0, Math.min(4, identifier.length)); }

function Progress({ value, onCancel }: { value: ProgressState; onCancel: () => void }) {
  return <section className="mt-8 overflow-hidden rounded-[1.4rem] border border-sky-300/15 bg-[#10161e]"><div className="p-6"><div className="flex items-start justify-between gap-5"><div><p className="text-[10px] font-semibold tracking-[.2em] text-sky-200/80">LEITURA LOCAL</p><h2 className="mt-2 text-lg font-semibold text-slate-100">{value.stage}</h2></div><span className="font-mono text-lg text-sky-200">{typeof value.progress === "number" ? `${value.progress}%` : "…"}</span></div><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-sky-300 transition-[width] duration-300" style={{ width: `${Math.max(2, value.progress ?? 2)}%` }} /></div><div className="mt-4 flex items-center justify-between gap-4 text-xs text-slate-500"><span><Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin text-sky-200" />{value.bytesRead ? `${formatBytes(value.bytesRead)} lidos` : "Preparando arquivo"}</span><span>{formatDuration(Date.now() - value.startedAt)}</span></div></div><div className="flex justify-end border-t border-white/[.07] px-6 py-3"><button onClick={onCancel} className="inline-flex items-center gap-2 text-xs text-slate-400 transition-colors hover:text-slate-100"><X className="h-3.5 w-3.5" />Cancelar</button></div></section>;
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="rounded-xl border border-white/[.08] bg-black/15 px-4 py-3"><p className="text-[10px] font-semibold tracking-[.18em] text-sky-200/75">{label}</p><p className={`mt-2 break-all text-sm leading-5 text-slate-200 ${mono ? "font-mono text-[12px]" : ""}`}>{value}</p></div>;
}

function UnknownCard({ item, index }: { item: ManualReview; index: number }) {
  const block = item.plistPath?.split(".")[0] ?? "Bloco permitido";
  return <article className="rounded-[1.25rem] border border-amber-300/25 bg-[#10161e] p-5"><p className="text-[10px] font-semibold tracking-[.2em] text-amber-200/90">IDENTIFICADOR {String(index + 1).padStart(2, "0")}</p><div className="mt-4 grid gap-3"><Info label="IDENTIFICADOR COMPLETO" value={item.identifier} mono /><div className="grid gap-3 sm:grid-cols-2"><Info label="PREFIXO" value={firstPrefix(item.identifier)} mono /><Info label="LOCAL" value={block} /></div><Info label="DECISÃO" value={item.reason} /></div></article>;
}

function ExactCard({ report }: { report: ScanReport }) {
  return <div className="space-y-3">{report.evidence.map(item => <article key={item.signatureId} className="rounded-[1.25rem] border border-emerald-300/25 bg-[#10161e] p-5"><p className="text-[10px] font-semibold tracking-[.2em] text-emerald-200/90">CORRESPONDÊNCIA EXATA</p><div className="mt-4 grid gap-3"><Info label="CATEGORIA" value={item.category} /><Info label="REGRA" value={item.signature} /><Info label="IDENTIFICADOR COMPLETO" value={item.value} mono /><Info label="LOCAL" value={item.plistPath?.split(".")[0] ?? "Bloco permitido"} /><Info label="DECISÃO" value={item.reason} /></div></article>)}</div>;
}

function ResultSummary({ report }: { report: ScanReport }) {
  const meta = resultMeta[report.result];
  const exact = report.evidence.length;
  const review = report.manualReviews.length;
  const showDetails = exact + review > 0;
  return <Collapsible><section className={`mt-7 overflow-hidden rounded-[1.5rem] border ${meta.tone}`}><div className="p-6 text-center sm:p-8"><p className="text-[10px] font-semibold tracking-[.22em] text-slate-400">O QUE FOI ENCONTRADO</p><div className="mt-5 flex justify-center"><span className={`rounded-full px-4 py-2 text-xs font-bold tracking-[.14em] ${meta.badge}`}>{meta.label}</span></div><p className="mx-auto mt-5 max-w-md text-sm leading-6 text-slate-300">{meta.description(exact, review)}</p>{showDetails && <CollapsibleTrigger asChild><button className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/[.12] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[.06]">Ver detalhes do log <ChevronDown className="h-3.5 w-3.5" /></button></CollapsibleTrigger>}</div>{showDetails && <CollapsibleContent><div className="border-t border-white/[.08] bg-[#0c1118]/60 p-4 sm:p-5">{exact > 0 && <ExactCard report={report} />}{review > 0 && <div className={exact ? "mt-5 border-t border-white/[.08] pt-5" : ""}>{exact > 0 && <p className="mb-3 text-[10px] font-semibold tracking-[.18em] text-amber-200/80">ITENS PARA VERIFICAR</p>}<div className="space-y-3">{report.manualReviews.map((item, index) => <UnknownCard key={`${item.identifier}-${index}`} item={item} index={index} />)}</div></div>}</div></CollapsibleContent>}</section></Collapsible>;
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

  useEffect(() => { void fetch("/data/signatures.json").then(response => response.json()).then(data => { if (!validSignatures(data)) throw new Error(); setSignatures(data); }).catch(() => toast.error("Não foi possível carregar a tabela RX7.")); return () => cancelRef.current?.(); }, []);
  const reset = () => { cancelRef.current?.(); cancelRef.current = null; startedAt.current = null; setFile(null); setFormat(null); setProgress(null); setReport(null); setDragging(false); if (input.current) input.current.value = ""; };
  const selectFile = async (candidate?: File) => { if (!candidate) return; try { if (!candidate.size || candidate.size > scanLimits.maxUploadBytes) throw new Error("Selecione um arquivo entre 1 byte e 350 MB."); setFormat(await detectArchiveFormat(candidate)); setFile(candidate); setReport(null); } catch (error) { toast.error(error instanceof Error ? error.message : "Arquivo inválido."); } };
  const onEvent = (event: WorkerEvent) => { if (event.type === "progress") setProgress({ ...event, startedAt: startedAt.current ?? Date.now() }); else if (event.type === "complete") { startedAt.current = null; setProgress(null); setReport(event.report); } else if (event.type === "error") { startedAt.current = null; setProgress(null); toast.error(event.message); } else { startedAt.current = null; setProgress(null); toast.message("Análise cancelada."); } };
  const start = () => { if (!file || !signatures.length) return toast.error("Aguarde a tabela RX7 carregar."); const now = Date.now(); startedAt.current = now; setProgress({ type: "progress", step: 1, stage: "Abrindo o pacote e localizando MCSettingsEvents", progress: 0, processedFileCount: 0, relevantFileCount: 0, bytesRead: 0, totalBytes: file.size, startedAt: now }); cancelRef.current = startLocalScan(file, signatures, onEvent); };
  const cancel = () => { cancelRef.current?.(); cancelRef.current = null; startedAt.current = null; setProgress(null); };

  return <main className="min-h-screen bg-[#080b10] px-4 py-8 text-slate-100 sm:px-6 sm:py-12"><div className="mx-auto max-w-2xl"><header className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl border border-sky-300/25 bg-sky-300/10"><ShieldCheck className="h-5 w-5 text-sky-200" /></div><p className="text-sm font-bold tracking-[.22em] text-slate-100">RX7</p></div><span className="text-[10px] font-medium tracking-[.15em] text-slate-500">/ RX7</span></header>{!report ? <section className="py-16 sm:py-24">{progress ? <Progress value={progress} onCancel={cancel} /> : <><input ref={input} type="file" accept=".tar.gz,.tgz,.zip" className="hidden" onChange={event => void selectFile(event.target.files?.[0])} /><button onClick={() => input.current?.click()} onDragEnter={event => { event.preventDefault(); setDragging(true); }} onDragOver={event => event.preventDefault()} onDragLeave={event => { event.preventDefault(); setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); void selectFile(event.dataTransfer.files?.[0]); }} className={`flex min-h-64 w-full flex-col items-center justify-center rounded-[1.75rem] border border-dashed px-6 transition-colors ${dragging ? "border-sky-200 bg-sky-300/[.08]" : "border-slate-700 bg-[#10161e] hover:border-sky-300/55"}`}><div className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-300/[.09] text-sky-200"><UploadCloud className="h-6 w-6" /></div><p className="mt-5 text-base font-semibold text-slate-100">Enviar Sysdiagnose</p><p className="mt-2 text-xs text-slate-500">.tar.gz · .tgz · .zip</p></button>{file && <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/[.08] bg-[#10161e] px-4 py-3"><FileArchive className="h-4 w-4 text-sky-200" /><div className="min-w-0 flex-1"><p className="truncate text-sm text-slate-200">{file.name}</p><p className="mt-0.5 text-xs text-slate-500">{formatBytes(file.size)} · {format === "zip" ? "ZIP" : "TAR.GZ"}</p></div><button onClick={reset} className="text-xs text-slate-500 hover:text-slate-200">Remover</button></div>}<Button disabled={!file || !signatures.length} onClick={start} className="mt-5 w-full bg-sky-300 py-6 text-sm font-semibold text-slate-950 hover:bg-sky-200"><FileUp className="mr-2 h-4 w-4" />Iniciar análise</Button></>}</section> : <section className="py-12 sm:py-16"><p className="text-[10px] font-semibold tracking-[.22em] text-sky-200/80">RELATÓRIO LOCAL</p><p className="mt-2 text-sm text-slate-500">{report.fileName} · {formatDuration(report.durationMs)}</p><ResultSummary report={report} /><div className="mt-6 flex flex-wrap gap-2"><Button variant="outline" onClick={() => exportJson(report)} className="border-slate-700 bg-transparent text-slate-300 hover:bg-white/[.05]"><FileJson2 className="mr-2 h-4 w-4" />JSON</Button><Button variant="outline" onClick={() => exportTxt(report)} className="border-slate-700 bg-transparent text-slate-300 hover:bg-white/[.05]"><FileText className="mr-2 h-4 w-4" />TXT</Button><Button variant="outline" onClick={() => exportPdf(report)} className="border-slate-700 bg-transparent text-slate-300 hover:bg-white/[.05]"><Download className="mr-2 h-4 w-4" />PDF</Button></div><button onClick={reset} className="mt-9 inline-flex items-center gap-2 text-xs text-slate-500 transition-colors hover:text-slate-200"><RotateCcw className="h-3.5 w-3.5" />Novo envio</button></section>}<footer className="border-t border-white/[.07] py-5 text-center text-[10px] tracking-[.14em] text-slate-600">DESENVOLVEDOR / RX7 <span className="px-1.5 text-slate-700">·</span> AUXILIAR DK</footer></div></main>;
}
