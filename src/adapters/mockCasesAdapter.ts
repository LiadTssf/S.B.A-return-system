// Mock adapter לתיקי החזרה — נתוני דמה ב-localStorage.
// TODO: Replace this adapter with Supabase implementation.
import * as store from "./mock/cases-store";
import { ensureSeed } from "./mock/seed";
import type { ReturnCase, CaseStatus } from "@/lib/case-types";

export const CASES_EVENT = "sba.cases.changed";
export type { CaseInput } from "./mock/cases-store";

export const mockCasesAdapter = {
  /** טעינת נתוני דמה (אידמפוטנטי לפי גרסה) */
  async init(): Promise<void> {
    ensureSeed();
  },
  async list(): Promise<ReturnCase[]> {
    ensureSeed();
    return store.getCases();
  },
  async get(id: string): Promise<ReturnCase | null> {
    ensureSeed();
    return store.getCase(id) ?? null;
  },
  async create(input: store.CaseInput): Promise<ReturnCase> {
    return store.createCase(input);
  },
  async update(
    id: string,
    patch: Partial<store.CaseInput>,
  ): Promise<ReturnCase | null> {
    return store.updateCase(id, patch) ?? null;
  },
  async setStatus(id: string, status: CaseStatus): Promise<ReturnCase | null> {
    return store.setStatus(id, status) ?? null;
  },
  async close(id: string): Promise<ReturnCase | null> {
    return store.closeCase(id) ?? null;
  },
  async listCustomers(): Promise<string[]> {
    return store.getCustomers();
  },
  // עזרים טהורים (ללא תלות ב-DB) — נחשפים דרך ה-adapter לנוחות
  diff: store.caseDiff,
  encodeForUrl: store.encodeCaseForUrl,
  rehydrateFromHash: store.rehydrateCaseFromHash,
  subscribe(cb: () => void): () => void {
    const h = () => cb();
    window.addEventListener(CASES_EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(CASES_EVENT, h);
      window.removeEventListener("storage", h);
    };
  },
};

export type CasesAdapter = typeof mockCasesAdapter;
