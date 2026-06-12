// Supabase adapter לתיאום משאיות — טבלת truck_coordination (שורה = segment).
import { getSupabase } from "@/lib/supabase";
import type { ReturnSchedule, ScheduleSegment } from "@/lib/schedule-types";

export const SCHEDULE_EVENT = "sba.schedules.changed";

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SCHEDULE_EVENT));
}

function toSeg(r: any): ScheduleSegment {
  return {
    id: r.id,
    plannedDate: r.planned_date ?? undefined,
    truckId: r.truck_id ?? undefined,
    driverName: r.driver_name ?? undefined,
    driverPhone: r.driver_phone ?? undefined,
    actualDate: r.actual_date ?? undefined,
    customerConfirmed: r.customer_confirmed ?? false,
    notes: r.notes ?? undefined,
  };
}

function segToRow(patch: Partial<Omit<ScheduleSegment, "id">>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ("plannedDate" in patch) row.planned_date = patch.plannedDate ?? null;
  if ("truckId" in patch) row.truck_id = patch.truckId ?? null;
  if ("driverName" in patch) row.driver_name = patch.driverName ?? null;
  if ("driverPhone" in patch) row.driver_phone = patch.driverPhone ?? null;
  if ("actualDate" in patch) row.actual_date = patch.actualDate ?? null;
  if ("customerConfirmed" in patch) row.customer_confirmed = patch.customerConfirmed ?? false;
  if ("notes" in patch) row.notes = patch.notes ?? null;
  return row;
}

function encodeForUrl(data: Record<string, ReturnSchedule>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return encodeURIComponent(btoa(bin));
}

export const supabaseScheduleAdapter = {
  async getForCase(caseId: string): Promise<ReturnSchedule | null> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("truck_coordination")
      .select("*")
      .eq("return_case_id", caseId);
    if (error) throw error;
    if (!data || data.length === 0) return null;
    const segments = data.map(toSeg);
    const updatedAt = data.reduce(
      (m: string, r: any) => (r.updated_at > m ? r.updated_at : m),
      data[0].updated_at,
    );
    return { caseId, segments, updatedAt };
  },
  async getAll(): Promise<Record<string, ReturnSchedule>> {
    const sb = getSupabase();
    const { data, error } = await sb.from("truck_coordination").select("*");
    if (error) throw error;
    const out: Record<string, ReturnSchedule> = {};
    for (const r of data ?? []) {
      const cid = r.return_case_id as string;
      if (!out[cid]) out[cid] = { caseId: cid, segments: [], updatedAt: r.updated_at };
      out[cid].segments.push(toSeg(r));
      if (r.updated_at > out[cid].updatedAt) out[cid].updatedAt = r.updated_at;
    }
    return out;
  },
  async addSegment(
    caseId: string,
    init: Partial<Omit<ScheduleSegment, "id">> = {},
  ): Promise<ScheduleSegment> {
    const sb = getSupabase();
    const now = new Date().toISOString();
    const row = {
      return_case_id: caseId,
      customer_confirmed: false,
      ...segToRow(init),
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await sb.from("truck_coordination").insert(row).select().single();
    if (error) throw error;
    emit();
    return toSeg(data);
  },
  async updateSegment(
    _caseId: string,
    segmentId: string,
    patch: Partial<Omit<ScheduleSegment, "id">>,
  ): Promise<ScheduleSegment | null> {
    const sb = getSupabase();
    const row = { ...segToRow(patch), updated_at: new Date().toISOString() };
    const { data, error } = await sb
      .from("truck_coordination")
      .update(row)
      .eq("id", segmentId)
      .select()
      .maybeSingle();
    if (error) throw error;
    emit();
    return data ? toSeg(data) : null;
  },
  async removeSegment(_caseId: string, segmentId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.from("truck_coordination").delete().eq("id", segmentId);
    if (error) throw error;
    emit();
  },
  async countOnDate(iso: string, excludeSegmentId?: string): Promise<number> {
    const sb = getSupabase();
    let q = sb
      .from("truck_coordination")
      .select("id", { count: "exact", head: true })
      .eq("planned_date", iso);
    if (excludeSegmentId) q = q.neq("id", excludeSegmentId);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  },
  encodeForUrl,
  rehydrateFromHash(): void {},
  subscribe(cb: () => void): () => void {
    const h = () => cb();
    window.addEventListener(SCHEDULE_EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(SCHEDULE_EVENT, h);
      window.removeEventListener("storage", h);
    };
  },
};
