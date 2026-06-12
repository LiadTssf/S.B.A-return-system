// Supabase adapter לתיקי החזרה — טבלת return_cases (+ upsert ל-customers/projects).
import { getSupabase } from "@/lib/supabase";
import { getActiveRole, ROLE_LABELS } from "@/lib/roles";
import type { CaseInput } from "./mock/cases-store";
import type { ReturnCase, CaseStatus } from "@/lib/case-types";

export const CASES_EVENT = "sba.cases.changed";

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CASES_EVENT));
}

// מיפוי שורת DB (snake_case) -> טיפוס האפליקציה (camelCase)
function toCase(r: any): ReturnCase {
  return {
    id: r.id,
    customer: r.customer_name,
    project: r.project_name,
    site: r.site,
    equipmentType: r.equipment_type,
    status: r.status,
    createdAt: r.created_at,
    createdBy: r.created_by ?? "",
    updatedAt: r.updated_at,
    closedAt: r.closed_at ?? undefined,
    closedBy: r.closed_by ?? undefined,
  };
}

// מספר תיק הבא: SBA-{שנה}-{NNNN}
async function nextCaseId(): Promise<string> {
  const sb = getSupabase();
  const year = new Date().getFullYear();
  const prefix = `SBA-${year}-`;
  const { data, error } = await sb.from("return_cases").select("id").like("id", `${prefix}%`);
  if (error) throw error;
  const max = (data ?? [])
    .map((r: any) => parseInt(String(r.id).slice(prefix.length), 10))
    .filter((n: number) => !Number.isNaN(n))
    .reduce((a: number, b: number) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

async function resolveCustomerId(name: string): Promise<string | null> {
  const sb = getSupabase();
  const { data } = await sb
    .from("customers")
    .upsert({ name }, { onConflict: "name" })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function resolveProjectId(
  customerId: string | null,
  name: string,
  site: string,
): Promise<string | null> {
  if (!customerId) return null;
  const sb = getSupabase();
  const { data: existing } = await sb
    .from("projects")
    .select("id")
    .eq("customer_id", customerId)
    .eq("name", name)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data: created } = await sb
    .from("projects")
    .insert({ customer_id: customerId, name, site })
    .select("id")
    .single();
  return created?.id ?? null;
}

// עזרים טהורים (זהים לאבטיפוס) — נחשפים דרך ה-adapter
function diff(a: CaseInput, b: CaseInput): string {
  const keys: (keyof CaseInput)[] = ["customer", "project", "site", "equipmentType"];
  const parts: string[] = [];
  for (const k of keys) if (a[k] !== b[k]) parts.push(`${k}: "${a[k]}" → "${b[k]}"`);
  return parts.join(", ");
}

function encodeForUrl(c: ReturnCase): string {
  const bytes = new TextEncoder().encode(JSON.stringify(c));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return encodeURIComponent(btoa(bin));
}

export const supabaseCasesAdapter = {
  async init(): Promise<void> {
    // אין seed ב-Supabase — ה-DB הוא מקור האמת.
  },
  async list(): Promise<ReturnCase[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("return_cases")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toCase);
  },
  async get(id: string): Promise<ReturnCase | null> {
    const sb = getSupabase();
    const { data, error } = await sb.from("return_cases").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? toCase(data) : null;
  },
  async create(input: CaseInput): Promise<ReturnCase> {
    const sb = getSupabase();
    const id = await nextCaseId();
    const now = new Date().toISOString();
    const customerId = await resolveCustomerId(input.customer);
    const projectId = await resolveProjectId(customerId, input.project, input.site);
    const { data, error } = await sb
      .from("return_cases")
      .insert({
        id,
        customer_id: customerId,
        project_id: projectId,
        customer_name: input.customer,
        project_name: input.project,
        site: input.site,
        equipment_type: input.equipmentType,
        status: "open",
        created_by: ROLE_LABELS[getActiveRole()],
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (error) throw error;
    emit();
    return toCase(data);
  },
  async update(id: string, patch: Partial<CaseInput>): Promise<ReturnCase | null> {
    const sb = getSupabase();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.customer !== undefined) row.customer_name = patch.customer;
    if (patch.project !== undefined) row.project_name = patch.project;
    if (patch.site !== undefined) row.site = patch.site;
    if (patch.equipmentType !== undefined) row.equipment_type = patch.equipmentType;
    const { data, error } = await sb
      .from("return_cases")
      .update(row)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    emit();
    return data ? toCase(data) : null;
  },
  async setStatus(id: string, status: CaseStatus): Promise<ReturnCase | null> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("return_cases")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    emit();
    return data ? toCase(data) : null;
  },
  async close(id: string): Promise<ReturnCase | null> {
    const sb = getSupabase();
    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("return_cases")
      .update({
        status: "completed",
        closed_at: now,
        closed_by: ROLE_LABELS[getActiveRole()],
        updated_at: now,
      })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    emit();
    return data ? toCase(data) : null;
  },
  async listCustomers(): Promise<string[]> {
    const sb = getSupabase();
    const { data, error } = await sb.from("return_cases").select("customer_name");
    if (error) throw error;
    return Array.from(new Set((data ?? []).map((r: any) => r.customer_name as string))).sort();
  },
  diff,
  encodeForUrl,
  rehydrateFromHash(): void {
    // לא רלוונטי ב-Supabase (היה מנגנון סנכרון cross-tab של האבטיפוס).
  },
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
