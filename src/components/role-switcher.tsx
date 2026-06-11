import { UserCog } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getActiveRole, setActiveRole, ROLE_LABELS, type Role } from "@/lib/roles";
import { useRole } from "@/hooks/use-role";

// ⚠️ כלי פיתוח בלבד — בורר תפקידים זמני לבדיקת הרשאות.
// TODO: להסיר ולהחליף בזהות משתמש אמיתית דרך Supabase Auth.
// תפקידים פנימיים בלבד (לקוח חיצוני נכנס דרך קישור חד-פעמי, לא דרך כאן).
const INTERNAL_ROLES: Role[] = ["coordinator", "logistics", "factory_manager"];

export function RoleSwitcher() {
  const role = useRole();
  const onChange = (value: string) => setActiveRole(value as Role);

  return (
    <div className="flex items-center gap-2" title="כלי פיתוח — בחירת תפקיד">
      <span className="hidden text-[10px] font-medium text-muted-foreground sm:inline">
        מצב פיתוח
      </span>
      <UserCog className="h-4 w-4 text-muted-foreground" />
      <Select value={getActiveRole()} onValueChange={onChange}>
        <SelectTrigger className="h-8 min-w-[170px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INTERNAL_ROLES.map((r) => (
            <SelectItem key={r} value={r} className="text-xs">
              {ROLE_LABELS[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
