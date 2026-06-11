// Mock adapter לחיפוש מתקדם — רץ מעל ה-mock stores.
// TODO: Replace with Supabase (חיפוש בצד שרת / full-text).
import * as search from "./mock/search";

export type { SearchFilters, SearchHit } from "./mock/search";
export { EMPTY_FILTERS } from "./mock/search";

export const mockSearchAdapter = {
  async search(filters: search.SearchFilters): Promise<search.SearchHit[]> {
    return search.searchCases(filters);
  },
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

export type SearchAdapter = typeof mockSearchAdapter;
