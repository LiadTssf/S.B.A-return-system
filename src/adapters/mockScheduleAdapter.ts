// Mock adapter לתיאום משאיות (segments) — נתוני דמה ב-localStorage.
// TODO: Replace this adapter with Supabase implementation.
import * as store from "./mock/schedule-store";
import type { ReturnSchedule, ScheduleSegment } from "@/lib/schedule-types";

export const SCHEDULE_EVENT = store.SCHEDULE_EVENT;

export const mockScheduleAdapter = {
  async getForCase(caseId: string): Promise<ReturnSchedule | null> {
    return store.getSchedule(caseId) ?? null;
  },
  async getAll(): Promise<Record<string, ReturnSchedule>> {
    return store.getAllSchedules();
  },
  async addSegment(
    caseId: string,
    init: Partial<Omit<ScheduleSegment, "id">> = {},
  ): Promise<ScheduleSegment> {
    return store.addSegment(caseId, init);
  },
  async updateSegment(
    caseId: string,
    segmentId: string,
    patch: Partial<Omit<ScheduleSegment, "id">>,
  ): Promise<ScheduleSegment | null> {
    return store.updateSegment(caseId, segmentId, patch) ?? null;
  },
  async removeSegment(caseId: string, segmentId: string): Promise<void> {
    store.removeSegment(caseId, segmentId);
  },
  async countOnDate(iso: string, excludeSegmentId?: string): Promise<number> {
    return store.countSchedulesOnDate(iso, excludeSegmentId);
  },
  encodeForUrl: store.encodeSchedulesForUrl,
  rehydrateFromHash: store.rehydrateSchedulesFromHash,
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

export type ScheduleAdapter = typeof mockScheduleAdapter;
