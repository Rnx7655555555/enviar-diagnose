import { openDB } from "idb";
import type { ScanReport } from "./types";

const database = openDB("rx7-local-history", 2, { upgrade(db) { if (!db.objectStoreNames.contains("reports")) db.createObjectStore("reports", { keyPath: "id" }); if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings"); } });

export async function saveLocalReport(report: ScanReport) { await (await database).put("reports", report); }
export async function listLocalReports() { return ((await (await database).getAll("reports")) as ScanReport[]).sort((a, b) => b.createdAt - a.createdAt); }
export async function removeLocalReport(id: string) { await (await database).delete("reports", id); }
export async function clearLocalReports() { await (await database).clear("reports"); }
export async function loadLocalSignatures<T>() { return (await (await database).get("settings", "signatures")) as T | undefined; }
export async function saveLocalSignatures<T>(signatures: T) { await (await database).put("settings", signatures, "signatures"); }
