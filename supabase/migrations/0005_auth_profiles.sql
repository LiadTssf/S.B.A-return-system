-- ============================================================
-- PART 4.5 — Auth פנימי: טבלת profiles + פונקציות עזר ל-RLS.
-- אדיטיבי בלבד. אין לערוך 0001-0004.
-- שלב זה אינו מפעיל RLS מגביל על הטבלאות התפעוליות (זה ב-0006).
-- ============================================================

-- ---------- פרופיל עובד פנימי (מקושר ל-auth.users) ----------
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role         text not null default 'coordinator'
                 check (role in ('coordinator','logistics','factory_manager','admin')),
  is_active    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- הערה: שמירת backward-compat ל-'logistics'. שינוי שם עתידי ל-'logistics_manager'
--        יחייב migration נפרד + עדכון קוד.

-- ---------- פונקציות עזר ל-RLS (ישומשו ב-0006) ----------
-- SECURITY DEFINER עם search_path בטוח, schema-qualified.
create or replace function public.is_active_employee()
  returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p where p.user_id = auth.uid() and p.is_active
  );
$$;

create or replace function public.current_app_role()
  returns text language sql stable security definer set search_path = public, pg_temp as $$
  select p.role from public.profiles p where p.user_id = auth.uid() and p.is_active;
$$;

create or replace function public.is_admin()
  returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.is_active and p.role = 'admin'
  );
$$;

-- חסימת PUBLIC + מתן הרשאה מפורשת בלבד
revoke all on function public.is_active_employee() from public;
revoke all on function public.current_app_role() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_active_employee() to authenticated, anon;
grant execute on function public.current_app_role() to authenticated, anon;
grant execute on function public.is_admin() to authenticated, anon;

-- ---------- יצירת פרופיל אוטומטית למשתמש Auth חדש (לא פעיל כברירת מחדל) ----------
create or replace function public.handle_new_user()
  returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (user_id, display_name, role, is_active)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email), 'coordinator', false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- RLS על profiles ----------
-- משתמש קורא את הפרופיל של עצמו; אדמין קורא הכל. כתיבה — לא מהלקוח (דרך SQL/Dashboard ב-MVP).
alter table public.profiles enable row level security;
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant select on public.profiles to authenticated;

-- updated_at אוטומטי
create or replace function public.touch_profiles_updated_at()
  returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_profiles_updated_at();
