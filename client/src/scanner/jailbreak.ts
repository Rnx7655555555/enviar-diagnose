import type { JailbreakFinding, JailbreakReport } from "./types";

type SourceKind = JailbreakFinding["sourceKind"];
type SignalFamily = JailbreakFinding["family"];

type JailbreakRule = {
  id: string;
  family: SignalFamily;
  label: string;
  matcher: RegExp;
};

const rules: JailbreakRule[] = [
  { id: "manager-cydia", family: "gerenciador", label: "Caminho técnico do gerenciador Cydia", matcher: /(?:^|[\s"'])\/(?:private\/)?(?:var\/jb\/)?Applications\/Cydia\.app\b/i },
  { id: "manager-sileo", family: "gerenciador", label: "Caminho técnico do gerenciador Sileo", matcher: /(?:^|[\s"'])\/(?:private\/)?(?:var\/jb\/)?Applications\/Sileo\.app\b/i },
  { id: "manager-zebra", family: "gerenciador", label: "Caminho técnico do gerenciador Zebra", matcher: /(?:^|[\s"'])\/(?:private\/)?(?:var\/jb\/)?Applications\/Zebra\.app\b/i },
  { id: "framework-substrate", family: "framework", label: "Diretório técnico MobileSubstrate", matcher: /\/Library\/MobileSubstrate\/DynamicLibraries\//i },
  { id: "framework-substitute", family: "framework", label: "Biblioteca técnica Substitute", matcher: /\bSubstitute\.dylib\b/i },
  { id: "framework-libhooker", family: "framework", label: "Biblioteca técnica libhooker", matcher: /\blibhooker(?:\.dylib)?\b/i },
  { id: "framework-ellekit", family: "framework", label: "Biblioteca técnica ElleKit", matcher: /\bElleKit(?:\.dylib)?\b/i },
  { id: "filesystem-var-jb", family: "sistema", label: "Raiz técnica rootless /var/jb", matcher: /(?:^|[\s"'])\/var\/jb(?:[\s/"']|$)/i },
  { id: "filesystem-procursus", family: "sistema", label: "Caminho técnico Procursus", matcher: /\/procursus(?:[\s/"']|$)/i },
  { id: "tool-palera1n", family: "ferramenta", label: "Marcador técnico palera1n", matcher: /\bpalera1n\b/i },
  { id: "tool-checkra1n", family: "ferramenta", label: "Marcador técnico checkra1n", matcher: /\bcheckra1n\b/i },
  { id: "tool-unc0ver", family: "ferramenta", label: "Marcador técnico unc0ver", matcher: /\bunc0ver\b/i },
  { id: "tool-dopamine", family: "ferramenta", label: "Marcador técnico Dopamine", matcher: /\bDopamine\b/i },
  { id: "tool-taurine", family: "ferramenta", label: "Marcador técnico Taurine", matcher: /\bTaurine\b/i },
  { id: "tool-xina", family: "ferramenta", label: "Marcador técnico XinaA15", matcher: /\bXinaA15\b/i },
  { id: "tool-roothide", family: "ferramenta", label: "Marcador técnico RootHide", matcher: /\bRootHide\b/i },
];

function normalizedPath(path: string) { return path.replace(/\\/g, "/").toLocaleLowerCase(); }

export function jailbreakSourceKind(path: string): SourceKind | null {
  const value = normalizedPath(path);
  if (value.endsWith("/ps.txt") || value === "ps.txt") return "processos";
  if (value.endsWith("/mount.txt") || value === "mount.txt") return "montagens";
  if (value.endsWith("/summaries/launchdlogs.log")) return "inicializacao";
  if (value.includes("/mobileinstallation/") || value.endsWith("/summaries/mobileinstallation.log")) return "instalacao";
  return null;
}

export function isJailbreakSourcePath(path: string) { return jailbreakSourceKind(path) !== null; }

export function findJailbreakSignals(sourcePath: string, text: string): JailbreakFinding[] {
  const sourceKind = jailbreakSourceKind(sourcePath);
  if (!sourceKind || !text) return [];
  return rules.filter(rule => rule.matcher.test(text)).map(rule => ({
    id: rule.id,
    family: rule.family,
    sourceKind,
    sourcePath,
    label: rule.label,
  }));
}

export function evaluateJailbreak(findings: JailbreakFinding[], sourcesReviewed: number, limitations: string[] = []): JailbreakReport {
  const uniqueFindings = Array.from(new Map(findings.map(item => [`${item.id}:${item.sourceKind}:${item.sourcePath}`, item])).values());
  const families = new Set(uniqueFindings.map(item => item.family));
  const sourceKinds = new Set(uniqueFindings.map(item => item.sourceKind));
  const confirmed = families.size >= 2 && sourceKinds.size >= 2;

  if (confirmed) {
    return {
      status: "yes",
      findings: uniqueFindings,
      sourcesReviewed,
      limitations,
      summary: "Evidências técnicas específicas foram encontradas em famílias e fontes independentes.",
    };
  }
  if (uniqueFindings.length) {
    return {
      status: "manual",
      findings: uniqueFindings,
      sourcesReviewed,
      limitations,
      summary: "Há sinal técnico isolado. Ele não confirma Jailbreak sem outra família e outra fonte independente.",
    };
  }
  return {
    status: "no",
    findings: [],
    sourcesReviewed,
    limitations,
    summary: "Nenhuma combinação técnica suficiente para indicar Jailbreak foi encontrada nas fontes analisadas.",
  };
}
