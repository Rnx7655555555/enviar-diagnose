import type { ExternalPanelCoverage, ExternalPanelFinding, ExternalPanelReport } from "./types";

type SourceKind = ExternalPanelFinding["sourceKind"];
type FindingFamily = ExternalPanelFinding["family"];

type KnownTool = { label: string; family: FindingFamily; rule: string };

const externalToolBundleIds = new Map<string, KnownTool>([
  ["com.rileytestut.altstore", { label: "AltStore", family: "instalador", rule: "Bundle ID completo de instalador externo reconhecido" }],
  ["com.opa334.trollstore", { label: "TrollStore", family: "instalador", rule: "Bundle ID completo de instalador externo reconhecido" }],
  ["com.opa334.trollstorepersistencehelper", { label: "TrollStore Persistence Helper", family: "instalador", rule: "Bundle ID completo de componente de instalação externa reconhecido" }],
  ["com.esign.esign", { label: "ESign", family: "assinatura", rule: "Bundle ID completo de ferramenta de assinatura de IPA reconhecida" }],
  ["com.usescarlet.ios", { label: "Scarlet", family: "instalador", rule: "Bundle ID completo de instalador externo reconhecido" }],
]);

const expectedSourceKinds: SourceKind[] = ["instalacao", "processos", "inicializacao", "atividade"];
const freeFireBundleIds = new Set(["com.dts.freefireth"]);
const robloxBundleIds = new Set(["gg.delta.bz"]);

function normalizedPath(path: string) { return path.replace(/\\/g, "/").toLocaleLowerCase(); }
function normalized(value: string) { return value.trim().toLocaleLowerCase(); }

export function externalPanelSourceKind(path: string): SourceKind | null {
  const value = normalizedPath(path);
  if (value.includes("/mobileinstallation/") || value.endsWith("/summaries/mobileinstallation.log")) return "instalacao";
  if (value.endsWith("/ps.txt") || value === "ps.txt") return "processos";
  if (value.endsWith("/summaries/launchdlogs.log")) return "inicializacao";
  if (value.endsWith("/runningboard/runningboard_state.log")) return "atividade";
  if (/(^|\/)accessibilityprefs\/.+\.plist$/i.test(value)) return "acessibilidade";
  if (value.endsWith(".mobileprovision") || value.endsWith(".provisionprofile") || value.endsWith(".cer") || value.endsWith(".crt")) return "assinatura";
  return null;
}

export function isExternalPanelSourcePath(path: string) { return externalPanelSourceKind(path) !== null; }

export function assessExternalPanelCoverage(paths: string[]): ExternalPanelCoverage {
  const available = new Set(paths.map(externalPanelSourceKind).filter((kind): kind is SourceKind => kind !== null));
  const sourceKinds = expectedSourceKinds.filter(kind => available.has(kind));
  const completeBaseline = sourceKinds.length === expectedSourceKinds.length;
  return {
    status: completeBaseline ? "available" : "limited",
    sourceKinds,
    note: completeBaseline
      ? "Cobertura passiva disponível: instalação, processos, inicialização e atividade foram conferidos. Não substitui uma análise em tempo real ou forense completa."
      : `Cobertura passiva limitada: faltou ${expectedSourceKinds.filter(kind => !available.has(kind)).join(", ")}. “Sem evidência” não equivale a prova de limpeza.`,
  };
}

function bundleIdentifiers(text: string) {
  const found = new Set<string>();
  const patterns = [
    /(?:MIInstallableBundle ID=|identifier\s+|bundle(?:\s+identifier|\s+id)?\s*[=:]\s*)([A-Za-z0-9][A-Za-z0-9.-]{2,180})/gi,
    /\[([A-Za-z0-9][A-Za-z0-9.-]{2,180})\/[A-F0-9-]{8,}/gi,
    /(?:application-identifier|application identifier)\s*[=:]\s*(?:[A-Z0-9]{10}\.)?([A-Za-z0-9][A-Za-z0-9.-]{2,180})/gi,
    /(?:CFBundleIdentifier|bundle identifier)\s*[=:]\s*([A-Za-z0-9][A-Za-z0-9.-]{2,180})/gi,
    /<key>\s*(?:application-identifier|CFBundleIdentifier)\s*<\/key>\s*<string>\s*(?:[A-Z0-9]{10}\.)?([A-Za-z0-9][A-Za-z0-9.-]{2,180})\s*<\/string>/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(text)) !== null) found.add(match[1] ?? "");
  }
  return Array.from(found).filter(Boolean);
}

function looksLikePanelBundle(identifier: string) {
  const label = normalized(identifier);
  return /(?:^|[.-])(?:cheat|aimbot|modmenu|mod-menu|menuhack|freefiremod|inject|external|xit)(?:[.-]|$)/i.test(label);
}

function installationContexts(text: string, identifier: string) {
  const lines = text.split(/\r?\n/);
  const exact = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`(?:MIInstallableBundle ID=|Customer:|Placeholder:)${exact}(?:\\b|[;/>])`, "i");
  return lines.flatMap((line, index) => matcher.test(line) ? [lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 10)).join("\n")] : []);
}

function hasNonStoreFreeFireInstall(contexts: string[]) {
  return contexts.some(context => /(?:MIInstallationDomainDeveloper|DeveloperMode|Sideload|Ad[ -]?Hoc|Enterprise|TestFlight)/i.test(context) && !/Distributor:\s*com\.apple\.AppStore/i.test(context));
}

export function findExternalPanelSignals(sourcePath: string, text: string): ExternalPanelFinding[] {
  const sourceKind = externalPanelSourceKind(sourcePath);
  if (!sourceKind || !text) return [];
  const found: ExternalPanelFinding[] = [];
  for (const bundleId of bundleIdentifiers(text)) {
    const normalizedBundleId = normalized(bundleId);
    if (robloxBundleIds.has(normalizedBundleId)) continue;
    const tool = externalToolBundleIds.get(normalizedBundleId);
    const contexts = sourceKind === "instalacao" ? installationContexts(text, bundleId) : [];
    const context = contexts.at(0);
    if (tool) found.push({ id: `known-tool-${normalized(bundleId)}`, family: tool.family, sourceKind, sourcePath, indicator: bundleId, label: `Ferramenta externa reconhecida: ${tool.label}`, assessment: "confirmada", matchType: "IDENTIFICADOR COMPLETO", rule: tool.rule, context });
    if (looksLikePanelBundle(bundleId)) found.push({ id: `panel-${normalized(bundleId)}`, family: "painel", sourceKind, sourcePath, indicator: bundleId, label: "Identificador estruturado com nome técnico de painel/modificação", assessment: "revisar", matchType: "SINAL ESTRUTURADO", rule: "Nome técnico de painel em bundle identifier completo; requer outra fonte independente", context });
    if (sourceKind === "instalacao" && freeFireBundleIds.has(normalized(bundleId)) && hasNonStoreFreeFireInstall(contexts)) {
      found.push({ id: `freefire-nonstore-${normalized(bundleId)}`, family: "distribuicao", sourceKind, sourcePath, indicator: bundleId, label: "Registro técnico de instalação do Free Fire fora da distribuição App Store", assessment: "revisar", matchType: "CONTEXTO DE INSTALAÇÃO", rule: "Registro de distribuição não-App-Store no mesmo contexto de instalação do jogo", context });
    }
  }
  return found;
}

export function evaluateExternalPanel(findings: ExternalPanelFinding[], sourcesReviewed: number, limitations: string[] = [], coverage: ExternalPanelCoverage = assessExternalPanelCoverage([])): ExternalPanelReport {
  const uniqueFindings = Array.from(new Map(findings.map(item => [`${item.id}:${item.sourceKind}:${item.sourcePath}`, item])).values());
  const families = new Set(uniqueFindings.map(item => item.family));
  const sourceKinds = new Set(uniqueFindings.map(item => item.sourceKind));
  const confirmedTool = uniqueFindings.some(item => item.assessment === "confirmada");
  const correlatedPanel = families.size >= 2 && sourceKinds.size >= 2 && uniqueFindings.some(item => item.family === "painel");
  if (confirmedTool) return { status: "yes", findings: uniqueFindings, sourcesReviewed, limitations, coverage, summary: "Uma ferramenta externa foi identificada por bundle identifier completo em fonte técnica estruturada. Isso não atribui uso de cheat a um jogo específico." };
  if (correlatedPanel) return { status: "yes", findings: uniqueFindings, sourcesReviewed, limitations, coverage, summary: "Sinais técnicos de painel/modificação foram encontrados em famílias e fontes independentes." };
  if (uniqueFindings.length) return { status: "manual", findings: uniqueFindings, sourcesReviewed, limitations, coverage, summary: "Há um sinal técnico de instalação, assinatura ou painel que exige conferência; ele não confirma cheat sozinho." };
  return { status: "no", findings: [], sourcesReviewed, limitations, coverage, summary: "Nenhuma combinação técnica suficiente foi observada nas fontes passivas disponíveis. Isso não prova ausência de painel." };
}
