import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { setAuthSession, type Role } from "@/lib/roles";

export interface Profile {
  user_id: string;
  display_name: string | null;
  role: Role;
  is_active: boolean;
}

interface AuthState {
  authEnabled: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function loadProfile(uid: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("profiles")
    .select("user_id, display_name, role, is_active")
    .eq("user_id", uid)
    .maybeSingle();
  return (data as Profile) ?? null;
}

function applyProfile(p: Profile | null) {
  setAuthSession(
    p ? { userId: p.user_id, displayName: p.display_name ?? "", role: p.role } : null,
  );
}

function translateAuthError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "אימייל או סיסמה שגויים";
  if (/email not confirmed/i.test(msg)) return "האימייל טרם אומת";
  if (/rate limit/i.test(msg)) return "יותר מדי ניסיונות. נסה שוב בעוד מספר דקות.";
  return "ההתחברות נכשלה. נסה שוב.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authEnabled = isSupabaseConfigured && !!supabase;
  const [loading, setLoading] = useState(authEnabled);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!authEnabled || !supabase) {
      setLoading(false);
      return;
    }
    let alive = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session ?? null);
      if (data.session?.user) {
        const p = await loadProfile(data.session.user.id);
        if (!alive) return;
        setProfile(p);
        applyProfile(p);
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s ?? null);
      if (s?.user) {
        const p = await loadProfile(s.user.id);
        setProfile(p);
        applyProfile(p);
      } else {
        setProfile(null);
        applyProfile(null);
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [authEnabled]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: "Supabase אינו מוגדר" };
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return { error: error ? translateAuthError(error.message) : null };
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setProfile(null);
    applyProfile(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      authEnabled,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      signIn,
      signOut,
    }),
    [authEnabled, loading, session, profile, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
