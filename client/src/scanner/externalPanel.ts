import type { ExternalPanelFinding, ExternalPanelReport } from "./types";

type SourceKind = ExternalPanelFinding["sourceKind"];
type FindingFamily = ExternalPanelFinding["family"];

const externalInstallerBundleIds = new Map<string, string>([
  ["com.rileytestut.altstore", "AltStore"],
  ["com.opa334.trollstore", "TrollStore"],
  ["com.opa334.trollstorepersistencehelper", "TrollStore Persistence Helper"],
  ["com.esign.esign", "ESign"],
  ["com.usescarlet.ios", "Scarlet"],
]);

function normalizedPath(path: string) { return path.replace(/\\/g, "/").toLocaleLowerCase(); }
function normalized(value: string) { return value.trim().toLocaleLowerCase(); }

export function externalPanelSourceKind(path: string): SourceKind | null {
  const value = normalizedPath(path);
  if (value.includes("/mobileinstallation/") || value.endsWith("/summaries/mobileinstallation.log")) return "instalacao";
  if (value.endsWith("/ps.txt") || value === "ps.txt") return "processos";
  if (value.endsWith("/summaries/launchdlogs.log")) return "inicializacao";
  return null;
}

export function isExternalPanelSourcePath(path: string) { return externalPanelSourceKind(path) !== null; }

function bundleIdentifiers(text: string) {
  const found = new Set<string>();
  const patterns = [
    /(?:MIInstallableBundle ID=|identifier\s+|bundle(?:\s+identifier|\s+id)?\s*[=:]\s*)([A-Za-z0-9][A-Za-z0-9.-]{2,180})/gi,
    /\[([A-Za-z0-9][A-Za-z0-9.-]{2,180})\/[A-F0-9-]{8,}/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(text)) !== null) found.add(match[1] ?? "");
  }
  return Array.from(found).filter(Boolean);
}

function looksLikePanelBundle(identifier: string) {
  const label = normalized(identifier);
  return /(?:^|[.-])(?:cheat|aimbot|modmenu|mod-menu|menuhack|freefiremod|inject)(?:[.-]|$)/i.test(label);
}

function hasNonStoreFreeFireInstall(text: string) {
  const gameLog = text.split(/\r?\n/).filter(line => /com\.dts\.freefire/i.test(line)).join("\n");
  return /(?:MIInstallationDomainDeveloper|DeveloperMode|Sideload|Ad[ -]?Hoc|Enterprise|TestFlight)/i.test(gameLog) && !/Distributor:\s*com\.apple\.AppStore/i.test(gameLog);
}

export function findExternalPanelSignals(sourcePath: string, text: string): ExternalPanelFinding[] {
  const sourceKind = externalPanelSourceKind(sourcePath);
  if (!sourceKind || !text) return [];
  const found: ExternalPanelFinding[] = [];
  for (const bundleId of bundleIdentifiers(text)) {
    const toolName = externalInstallerBundleIds.get(normalized(bundleId));
    if (toolName) found.push({ id: `installer-${normalized(bundleId)}`, family: "instalador", sourceKind, sourcePath, indicator: bundleId, label: `Ferramenta de instalação externa: ${toolName}` });
    if (looksLikePanelBundle(bundleId)) found.push({ id: `panel-${normalized(bundleId)}`, family: "painel", sourceKind, sourcePath, indicator: bundleId, label: "Identificador estruturado com nome técnico de painel/modificação" });
  }
  if (sourceKind === "instalacao" && hasNonStoreFreeFireInstall(text)) {
    found.push({ id: "freefire-nonstore-install", family: "distribuicao", sourceKind, sourcePath, indicator: "com.dts.freefire*", label: "Registro técnico de instalação do jogo fora da distribuição App Store" });
  }
  return found;
}

export function evaluateExternalPanel(findings: ExternalPanelFinding[], sourcesReviewed: number, limitations: string[] = []): ExternalPanelReport {
  const uniqueFindings = Array.from(new Map(findings.map(item => [`${item.id}:${item.sourceKind}:${item.sourcePath}`, item])).values());
  const families = new Set(uniqueFindings.map(item => item.family));
  const sourceKinds = new Set(uniqueFindings.map(item => item.sourceKind));
  const confirmed = families.size >= 2 && sourceKinds.size >= 2 && uniqueFindings.some(item => item.family === "painel");
  if (confirmed) return { status: "yes", findings: uniqueFindings, sourcesReviewed, limitations, summary: "Sinais técnicos de painel/modificação e de instalação foram encontrados em fontes independentes." };
  if (uniqueFindings.length) return { status: "manual", findings: uniqueFindings, sourcesReviewed, limitations, summary: "Há um sinal técnico de instalação ou painel que exige conferência; ele não confirma cheat sozinho." };
  return { status: "no", findings: [], sourcesReviewed, limitations, summary: "Nenhum conjunto técnico suficiente para indicar painel externo foi encontrado nas fontes passivas avaliadas." };
}
