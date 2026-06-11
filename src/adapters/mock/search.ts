import type { ReturnCase, CaseStatus, EquipmentType } from "@/lib/case-types";
import { getCases } from "./cases-store";
import { getAllSchedules } from "./schedule-store";
import { getAllDocuments } from "./documents-store";
import type { CaseDocument } from "@/lib/document-types";
import type { ReturnSchedule, ScheduleSegment } from "@/lib/schedule-types";

export interface SearchFilters {
  q: string;
  statuses: CaseStatus[];
  equipmentTypes: EquipmentType[];
  dateFrom?: string; // ISO yyyy-mm-dd — מתייחס לתאריך מתוכנן של החזרה
  dateTo?: string;
  openTrucksOnly: boolean; // יש משאית שלא הוחזרה בפועל
  pendingCustomerConfirmation: boolean; // יש משאית עם תאריך מתוכנן ובלי אישור לקוח
  noReturnCertificate: boolean; // משאית שהוחזרה בפועל ללא תעודת החזרה
}

export const EMPTY_FILTERS: SearchFilters = {
  q: "",
  statuses: [],
  equipmentTypes: [],
  dateFrom: undefined,
  dateTo: undefined,
  openTrucksOnly: false,
  pendingCustomerConfirmation: false,
  noReturnCertificate: false,
};

export interface SearchHit {
  case: ReturnCase;
  schedule?: ReturnSchedule;
  documents: CaseDocument[];
  matchedDocuments: CaseDocument[];
  matchedFields: string[]; // למשל: "לקוח", "פרויקט", "כותרת מסמך"
  segmentsCount: number;
  openSegmentsCount: number;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function inDateRange(iso: string | undefined, from?: string, to?: string): boolean {
  if (!iso) return false;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

function segmentMatchesDate(seg: ScheduleSegment, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  return inDateRange(seg.plannedDate, from, to) || inDateRange(seg.actualDate, from, to);
}

function caseMatchesText(c: ReturnCase, q: string, matched: Set<string>): boolean {
  if (!q) return true;
  const n = normalize(q);
  let hit = false;
  if (normalize(c.id).includes(n)) { matched.add("מס׳ תיק"); hit = true; }
  if (normalize(c.customer).includes(n)) { matched.add("לקוח"); hit = true; }
  if (normalize(c.project).includes(n)) { matched.add("פרויקט"); hit = true; }
  if (normalize(c.site).includes(n)) { matched.add("אתר"); hit = true; }
  return hit;
}

function docMatchesText(d: CaseDocument, q: string): boolean {
  if (!q) return false;
  const n = normalize(q);
  return normalize(d.title).includes(n) || normalize(d.fileName).includes(n);
}


export function searchCases(filters: SearchFilters): SearchHit[] {
  const cases = getCases();
  const schedules = getAllSchedules();
  const allDocs = getAllDocuments();
  const q = filters.q.trim();
  const results: SearchHit[] = [];

  for (const c of cases) {
    if (filters.statuses.length > 0 && !filters.statuses.includes(c.status)) continue;
    if (filters.equipmentTypes.length > 0 && !filters.equipmentTypes.includes(c.equipmentType)) continue;

    const sched = schedules[c.id];
    const docs = allDocs.filter((d) => d.caseId === c.id);

    // טקסט חופשי: התאמה על תיק או מסמכים
    const matchedFields = new Set<string>();
    let textHit = !q;
    if (q) {
      if (caseMatchesText(c, q, matchedFields)) textHit = true;
    }
    const matchedDocs = q ? docs.filter((d) => docMatchesText(d, q)) : [];
    if (q && matchedDocs.length > 0) { matchedFields.add("מסמך/תמונה"); textHit = true; }
    if (!textHit) continue;

    // טווח תאריכים — אם הוגדר, חייב סגמנט אחד לפחות בטווח
    if (filters.dateFrom || filters.dateTo) {
      const ok = sched?.segments.some((s) => segmentMatchesDate(s, filters.dateFrom, filters.dateTo));
      if (!ok) continue;
    }

    const segs = sched?.segments ?? [];
    const openSegs = segs.filter((s) => !s.actualDate);

    if (filters.openTrucksOnly && openSegs.length === 0) continue;
    if (filters.pendingCustomerConfirmation) {
      const ok = segs.some((s) => s.plannedDate && !s.customerConfirmed);
      if (!ok) continue;
    }
    if (filters.noReturnCertificate) {
      const ok = segs.some((s) => {
        if (!s.actualDate) return false;
        return !docs.some(
          (d) =>
            d.category === "return_certificate" &&
            d.attachment.type === "segment" &&
            d.attachment.segmentId === s.id,
        );
      });
      if (!ok) continue;
    }

    results.push({
      case: c,
      schedule: sched,
      documents: docs,
      matchedDocuments: matchedDocs,
      matchedFields: Array.from(matchedFields),
      segmentsCount: segs.length,
      openSegmentsCount: openSegs.length,
    });
  }

  return results;
}