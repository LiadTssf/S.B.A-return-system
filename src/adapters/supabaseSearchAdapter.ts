// Supabase adapter לחיפוש מתקדם — חיפוש על נתוני אמת בלבד (return_cases +
// truck_coordination + case_documents). אין שימוש ב-mock/seed/localStorage.
import { getSupabase } from "@/lib/supabase";
import {
  STATUS_LABELS,
  EQUIPMENT_LABELS,
  type ReturnCase,
} from "@/lib/case-types";
import type { ReturnSchedule, ScheduleSegment } from "@/lib/schedule-types";
import type { SearchFilters, SearchHit } from "./mock/search";

// סגמנט "פתוח" = לא חזר בפועל ואינו במצב סגור/בוטל
const NOT_OPEN_STATUSES = ["completed", "closed", "cancelled"];
// סגמנט "שחזר" = יש תאריך החזרה בפועל או סטטוס שמעיד על החזרה
const RETURNED_STATUSES = ["returned_to_plant", "completed", "closed"];

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

const norm = (s: string) => s.trim().toLowerCase();

function inRange(iso: string | undefined, from?: string, to?: string): boolean {
  if (!iso) return false;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

async function search(filters: SearchFilters): Promise<SearchHit[]> {
  const sb = getSupabase();

  // 1) תיקים — סינון סטטוס/סוג ציוד בצד שרת
  let cq = sb.from("return_cases").select("*").order("updated_at", { ascending: false });
  if (filters.statuses.length > 0) cq = cq.in("status", filters.statuses);
  if (filters.equipmentTypes.length > 0) cq = cq.in("equipment_type", filters.equipmentTypes);
  const { data: caseRows, error: ce } = await cq;
  if (ce) throw ce;
  const cases = (caseRows ?? []).map(toCase);
  if (cases.length === 0) return [];

  const ids = cases.map((c) => c.id);

  // 2) תיאומי משאית לתיקים אלו
  const { data: segRows, error: se } = await sb
    .from("truck_coordination")
    .select("*")
    .in("return_case_id", ids);
  if (se) throw se;
  const segsByCase = new Map<string, any[]>();
  for (const r of segRows ?? []) {
    const arr = segsByCase.get(r.return_case_id) ?? [];
    arr.push(r);
    segsByCase.set(r.return_case_id, arr);
  }

  // 3) מסמכים (סוג בלבד) — לצורך מסנן "ללא תעודת החזרה"
  const { data: docRows, error: de } = await sb
    .from("case_documents")
    .select("return_case_id, document_type")
    .in("return_case_id", ids);
  if (de) throw de;
  const docTypesByCase = new Map<string, string[]>();
  for (const r of docRows ?? []) {
    const arr = docTypesByCase.get(r.return_case_id) ?? [];
    arr.push(r.document_type);
    docTypesByCase.set(r.return_case_id, arr);
  }

  const q = filters.q.trim();
  const nq = norm(q);
  const hits: SearchHit[] = [];

  for (const c of cases) {
    const rawSegs = segsByCase.get(c.id) ?? [];
    const segs: ScheduleSegment[] = rawSegs.map(toSeg);
    const docTypes = docTypesByCase.get(c.id) ?? [];

    // ── טקסט חופשי ──
    const matched = new Set<string>();
    let textHit = !q;
    if (q) {
      if (norm(c.id).includes(nq)) { matched.add("מס׳ תיק"); textHit = true; }
      if (norm(c.customer).includes(nq)) { matched.add("לקוח"); textHit = true; }
      if (norm(c.project).includes(nq)) { matched.add("פרויקט"); textHit = true; }
      if (norm(c.site).includes(nq)) { matched.add("אתר"); textHit = true; }
      if (norm(c.equipmentType).includes(nq) || norm(EQUIPMENT_LABELS[c.equipmentType]).includes(nq)) {
        matched.add("סוג ציוד"); textHit = true;
      }
      if (norm(c.status).includes(nq) || norm(STATUS_LABELS[c.status]).includes(nq)) {
        matched.add("סטטוס"); textHit = true;
      }
      if (rawSegs.some((s) => s.notes && norm(String(s.notes)).includes(nq))) {
        matched.add("הערות"); textHit = true;
      }
    }
    if (!textHit) continue;

    // ── טווח תאריכי החזרה (planned או actual) ──
    if (filters.dateFrom || filters.dateTo) {
      const ok = rawSegs.some(
        (s) =>
          inRange(s.planned_date ?? undefined, filters.dateFrom, filters.dateTo) ||
          inRange(s.actual_date ?? undefined, filters.dateFrom, filters.dateTo),
      );
      if (!ok) continue;
    }

    const openSegs = rawSegs.filter(
      (s) => !s.actual_date && !NOT_OPEN_STATUSES.includes(s.status),
    );

    // ── מסנן: רק תיקים עם משאיות פתוחות ──
    if (filters.openTrucksOnly && openSegs.length === 0) continue;

    // ── מסנן: ממתינים לאישור לקוח ──
    if (filters.pendingCustomerConfirmation) {
      const ok = rawSegs.some((s) => s.planned_date && !s.customer_confirmed);
      if (!ok) continue;
    }

    // ── מסנן: משאיות שהוחזרו ללא תעודת החזרה/משלוח ──
    if (filters.noReturnCertificate) {
      const returned = rawSegs.some(
        (s) => s.actual_date || RETURNED_STATUSES.includes(s.status),
      );
      const hasCert =
        docTypes.includes("return_certificate") || docTypes.includes("delivery_note");
      if (!(returned && !hasCert)) continue;
    }

    const schedule: ReturnSchedule | undefined =
      rawSegs.length > 0
        ? {
            caseId: c.id,
            segments: segs,
            updatedAt: rawSegs.reduce(
              (m: string, r: any) => (r.updated_at > m ? r.updated_at : m),
              rawSegs[0].updated_at,
            ),
          }
        : undefined;

    hits.push({
      case: c,
      schedule,
      documents: [], // TODO PART 2: למפות case_documents -> CaseDocument (כרגע ספירת הקבצים תהיה 0)
      matchedDocuments: [],
      matchedFields: Array.from(matched),
      segmentsCount: segs.length,
      openSegmentsCount: openSegs.length,
    });
  }

  return hits;
}

export const supabaseSearchAdapter = {
  search,
  subscribe(cb: () => void): () => void {
    const events = [
      "sba.cases.changed",
      "sba.schedules.changed",
      "sba.documents.changed",
      "storage",
    ];
    const h = () => cb();
    events.forEach((e) => window.addEventListener(e, h));
    return () => events.forEach((e) => window.removeEventListener(e, h));
  },
};

export type SupabaseSearchAdapter = typeof supabaseSearchAdapter;
