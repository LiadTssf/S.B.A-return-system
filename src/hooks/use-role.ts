import { useEffect, useState } from "react";
import { getActiveRole, ROLE_CHANGED_EVENT, type Role } from "@/lib/roles";

export function useRole(): Role {
  const [role, setRole] = useState<Role>("coordinator");
  useEffect(() => {
    const refresh = () => setRole(getActiveRole());
    refresh();
    window.addEventListener(ROLE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(ROLE_CHANGED_EVENT, refresh);
  }, []);
  return role;
}
