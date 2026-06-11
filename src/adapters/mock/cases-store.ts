import {
  type CaseStatus,
  type EquipmentType,
  type ReturnCase,
} from "@/lib/case-types";
import { ROLE_LABELS, getActiveRole } from "@/lib/roles";
import { ensureSeed as runSeed } from "./seed";

const STORAGE_KEY = "sba.cases";

function read(): ReturnCase[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(cases: ReturnCase[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
  window.dispatchEvent(new Event("sba.cases.changed"));
}

function nextCaseId(cases: ReturnCase[]): string {
  const year = new Date().getFullYear();
  const prefix = `SBA-${year}-`;
  const max = cases
    .filter((c) => c.id.startsWith(prefix))
    .map((c) => parseInt(c.id.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function ensureSeed() {
  runSeed();
}

export function getCases(): ReturnCase[] {
  return read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getCase(id: string): ReturnCase | undefined {
  return read().find((c) => c.id === id);
}

/** מסדר תיק לערך base64 URL-safe לשימוש ב-hash של קישור לקוח */
export function encodeCaseForUrl(c: ReturnCase): string {
  const bytes = new TextEncoder().encode(JSON.stringify(c));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return encodeURIComponent(btoa(bin));
}

/** משחזר תיק מ-hash (#c=...) אם קיים — לטיפול במצב של אורגינים שונים בין tabs */
export function rehydrateCaseFromHash() {
  if (typeof window === "undefined") return;
  const hash = window.location.hash;
  if (!hash || !hash.includes("c=")) return;
  try {
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const raw = params.get("c");
    if (!raw) return;
    const bin = atob(decodeURIComponent(raw));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const incoming = JSON.parse(json) as ReturnCase;
    if (!incoming?.id) return;
    const all = read();
    if (all.some((x) => x.id === incoming.id)) return;
    write([incoming, ...all]);
  } catch {
    // ignore malformed hash
  }
}

export function getCustomers(): string[] {
  const set = new Set(read().map((c) => c.customer));
  return Array.from(set).sort();
}

export interface CaseInput {
  customer: string;
  project: string;
  site: string;
  equipmentType: EquipmentType;
}

export function createCase(input: CaseInput): ReturnCase {
  const cases = read();
  const now = new Date().toISOString();
  const newCase: ReturnCase = {
    id: nextCaseId(cases),
    ...input,
    status: "open",
    createdAt: now,
    createdBy: ROLE_LABELS[getActiveRole()],
    updatedAt: now,
  };
  write([newCase, ...cases]);
  return newCase;
}

export function updateCase(id: string, patch: Partial<CaseInput>): ReturnCase | undefined {
  const cases = read();
  const idx = cases.findIndex((c) => c.id === id);
  if (idx === -1) return undefined;
  const updated: ReturnCase = {
    ...cases[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  cases[idx] = updated;
  write(cases);
  return updated;
}

export function setStatus(id: string, status: CaseStatus): ReturnCase | undefined {
  const cases = read();
  const idx = cases.findIndex((c) => c.id === id);
  if (idx === -1) return undefined;
  cases[idx] = { ...cases[idx], status, updatedAt: new Date().toISOString() };
  write(cases);
  return cases[idx];
}

export function closeCase(id: string): ReturnCase | undefined {
  const cases = read();
  const idx = cases.findIndex((c) => c.id === id);
  if (idx === -1) return undefined;
  const now = new Date().toISOString();
  cases[idx] = {
    ...cases[idx],
    status: "completed",
    closedAt: now,
    closedBy: ROLE_LABELS[getActiveRole()],
    updatedAt: now,
  };
  write(cases);
  return cases[idx];
}

export function caseDiff(a: CaseInput, b: CaseInput): string {
  const keys: (keyof CaseInput)[] = ["customer", "project", "site", "equipmentType"];
  const parts: string[] = [];
  for (const k of keys) {
    if (a[k] !== b[k]) parts.push(`${k}: "${a[k]}" → "${b[k]}"`);
  }
  return parts.join(", ");
}