import { useState } from "react";
import { LogIn } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    const { error } = await signIn(email, password);
    if (error) {
      setError(error);
      setBusy(false);
    }
    // בהצלחה — ה-session יתעדכן וה-root יציג את האפליקציה.
  };

  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-background p-4"
    >
      <Card className="w-full max-w-sm shadow-[var(--shadow-modal)]">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-md bg-primary text-xl font-bold text-primary-foreground">
            ש
          </div>
          <CardTitle className="text-lg">מערכת S.B.A — ניהול החזרות</CardTitle>
          <p className="text-xs text-muted-foreground">כניסת עובדי ש.ב.א</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">אימייל</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">סיסמה</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy} className="mt-1 gap-2">
              <LogIn className="h-4 w-4" />
              {busy ? "מתחבר…" : "כניסה"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
