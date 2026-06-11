import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

interface Props {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/**
 * לייאאוט ציבורי לדפי לקוח חיצוני (/c/$token).
 * ללא סייד-בר, ללא role-switcher.
 */
export function ExternalShell({ title, subtitle, children }: Props) {
  return (
    <div dir="rtl" className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-6 sm:py-10">
      <header className="flex items-center gap-3 border-b border-border pb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
          ש
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight">ש.ב.א.</span>
          <span className="text-[11px] text-muted-foreground leading-tight">
            מערכת ניהול החזרות
          </span>
        </div>
        <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
          <ShieldCheck className="h-3 w-3" />
          קישור מאובטח
        </span>
      </header>

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="flex flex-col gap-4">{children}</div>

      <footer className="mt-auto pt-6 text-center text-[11px] text-muted-foreground">
        <Link to="/" className="hover:underline">
          ש.ב.א. © כל הזכויות שמורות
        </Link>
      </footer>
    </div>
  );
}
