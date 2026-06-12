// לקוח Supabase — נטען רק אם הוגדרו משתני סביבה.
// אין סודות בקוד. ערכים מגיעים מ-.env.local (ראה .env.local.example).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// נרמול: מקבלים את כתובת הפרויקט הבסיסית. אם הודבקה בטעות כתובת ה-REST
// (מסתיימת ב-/rest/v1) או עם / בסוף — מסירים אותם.
function normalizeUrl(u?: string): string | undefined {
  if (!u) return u;
  return u.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
}

const url = normalizeUrl(import.meta.env.VITE_SUPABASE_URL);
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

// אם לא הוגדר — נשאר null, והאפליקציה רצה על mock adapters.
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase לא מוגדר. הוסף VITE_SUPABASE_URL ו-VITE_SUPABASE_ANON_KEY ל-.env.local",
    );
  }
  return supabase;
}
