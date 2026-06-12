// דגל יחיד: האם Supabase מוגדר (יש URL + מפתח ב-.env.local)?
// במודול נפרד כדי למנוע תלות מעגלית בין index.ts ל-mock adapters.
export const SUPABASE_ENABLED = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);
