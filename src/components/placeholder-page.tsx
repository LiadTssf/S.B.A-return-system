import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LucideIcon } from "lucide-react";

interface Props {
  epic: number;
  title: string;
  description: string;
  icon: LucideIcon;
  stories: string[];
}

export function PlaceholderPage({ epic, title, description, icon: Icon, stories }: Props) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-accent">אפיק {epic}</p>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </header>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">סטוריז מתוכננים</h2>
            <Badge variant="outline" className="text-[10px]">
              ממתין לאישור לבנייה
            </Badge>
          </div>
          <ul className="space-y-2 text-sm">
            {stories.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {epic}.{i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            אפיק זה יבנה לאחר אישור. נבנה סטורי-סטורי, נעצור לבדיקה ונאשר לפני המעבר הבא.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}