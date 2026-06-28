# CLAUDE_HANDOFF_PART5 — S.B.A Return Management

> ⚠️ **HISTORICAL — original PART 5 plan (superseded).** This is the pre-work plan. For the current, authoritative state read **`CLAUDE_HANDOFF_PART5_PROGRESS.md`**. As of the latest checkpoint: migrations 0007–0010 applied & verified, PART 5 backend complete (smoke-0010 29/29; regressions + typecheck + build pass), committed to `main` and pushed to `origin/main`. Intake UI + simulator rewiring are NOT yet implemented. Kept for reference only — do not treat the status lines below as current.

Handoff for a NEW Claude Code conversation that will implement **PART 5** (real customer workflow + one-time token lifecycle + shared channel-independent services). Read this fully before doing anything.

---

## 1. Project and repository
- **Repository:** `S.B.A-return-system` — https://github.com/LiadTssf/S.B.A-return-system
- **Working path:** `…/claude-workspace/retrun management system/main project` (the live system).
- **Branch:** `main`
- **Local HEAD:** `7edef15` (PART 4.5)
- **origin/main:** `7edef15` (local == remote, working tree clean)
- **Pushed commit history (this project):**
  ```
  3db3298  Initial main project migration
  30adf9d  Day 2: connect cases, truck coordination, action items, audit to Supabase
  c62f07e  Day 2 / Part 1: Supabase-backed advanced search
  64046b9  Day 2 / Parts 2-3: real documents and truck-close validation
  e5fe576  Day 2 follow-up: restore user-friendly document title
  7443673  Day 2 / Part 4: handoff clarity
  7edef15  PART 4.5: minimal internal Supabase Auth + RLS foundation   ← HEAD
  ```
- **`sba-returns` (sibling folder) MUST NOT be touched** — it is the frozen Lovable prototype, reference only.
- Stack: React 19 + Vite + TanStack Router (SPA) + Tailwind + shadcn, Hebrew RTL. Backend: Supabase (PostgreSQL + Storage). Data layer: `src/adapters/` with an auto-selector (`index.ts`) — Supabase when `.env.local` has `VITE_SUPABASE_URL`+`VITE_SUPABASE_ANON_KEY`, else mock. **`main project/HANDOFF.md` is the authoritative status doc.**

## 2. Completed implementation (fully implemented + verified)
Connected to Supabase and verified against the live DB:
- **Return cases** (`return_cases`) + **customers**/**projects** (upsert on create).
- **Truck coordination** (`truck_coordination`) + calendar data.
- **Action items** (`action_items`).
- **Audit logs** (`audit_logs`).
- **Advanced search** — queries real data only.
- **Documents** — real **Supabase Storage** (`case-documents` bucket) + `case_documents` metadata; view/download via signed URL.
- **Truck-closing document validation** — blocks closing unless the case has (return_certificate OR delivery_note) AND truck_photo, reading real `case_documents`.
- **Prototype/handoff notices** — `PrototypeNotice` marks still-mock modules in the UI.
- **Internal Supabase Auth** — login/logout/persistent session, `profiles` table + roles, protected internal routes, inactive-user denial.
- **RLS + Storage policies** — role-based, anon blocked, audit immutable.

Adapters: `supabase*Adapter.ts` exist for cases, schedule, action-items, audit, search, documents. Still **mock** (selected only when Supabase off, and guarded to empty in Supabase mode): `mockCustomerLinksAdapter`, `mockNotificationsAdapter`, `mockRemindersAdapter`.

## 3. Applied migrations (in order)
- `0001_init.sql` — core tables: customers, projects, return_cases, truck_coordination, case_documents, action_items, audit_logs, customer_tokens (+ dev RLS, indexes).
- `0002_storage.sql` — private `case-documents` Storage bucket + dev policy.
- `0003_grants.sql` — grants to anon/authenticated (fixed "permission denied for table").
- `0004_case_documents_title.sql` — nullable `title` display column on case_documents.
- `0005_auth_profiles.sql` — `profiles` table (user_id→auth.users, role, is_active) + SECURITY DEFINER helpers `is_active_employee()`/`current_app_role()`/`is_admin()` + new-user trigger (creates inactive profile) + profiles RLS (self/admin read).
- `0006_rls.sql` — replaced dev_all with role-based RLS on all operational tables + Storage; revoked anon table grants; audit_logs immutable.

**The next migration must be `0007_customer_workflow.sql`** (additive). Do not edit `0001`–`0006`.

## 4. Auth and RLS state
- **Roles:** `coordinator`, `logistics`, `factory_manager`, `admin` (stored in `profiles.role`). `logistics` was intentionally kept (not collapsed into admin). Possible future rename `logistics`→`logistics_manager` (would need a migration + code update). Centralized in `src/lib/permissions.ts` (`OPERATIONAL = coordinator/logistics/admin`, `INTERNAL_VIEW = +factory_manager`).
- **Active-profile requirement:** all access requires `profiles.is_active = true` (`is_active_employee()`).
- **Operational write access:** coordinator / logistics / admin.
- **factory_manager:** read-only (MVP policy, not a permanent decision; live test still pending).
- **anon:** blocked from direct operational tables AND Storage. (PART 5 will open ONLY narrow token RPCs to anon.)
- **audit_logs:** immutable from client (no UPDATE/DELETE policy + explicit revoke).
- **Storage:** private `case-documents` bucket; signed URLs; internal-only writes for now.
- **First admin created:** Dashboard → Authentication → Add user (Auto Confirm) → trigger makes an inactive profile → SQL `update profiles set role='admin', is_active=true where user_id=(select id from auth.users where email='…')`.
- **Dedicated smoke-test account:** an active `coordinator` user used only by the smoke scripts; credentials live ONLY in `.env.local` as `SMOKE_TEST_EMAIL`/`SMOKE_TEST_PASSWORD`. **Never print or commit credentials.** Browser/scripts use the publishable key only — never the service/secret key.

## 5. Test results (verified)
- **Authenticated smoke (`scripts/smoke-auth.mjs`): 19/19 passed** — coordinator CRUD on operational tables, Storage upload + signed URL + download, audit insert.
- **Inactive-user denial (`scripts/smoke-inactive.mjs`): 5/5 passed** — login succeeds (Auth ≠ profile) but `is_active_employee()=false`, INSERT denied, SELECT returns 0 rows, Storage upload denied.
- **Anonymous negative-access:** anon SELECT/INSERT on tables denied; anon Storage upload denied; anon audit read denied. ✓
- **Storage:** authed upload/signed-URL/download work; anon denied. ✓
- **Audit immutability:** UPDATE/DELETE denied for authed + anon. ✓
- **typecheck:** 0 errors. **build:** 0 errors.
- **Cleanup:** smoke scripts delete their test rows/objects. Exception: a few `audit_logs` rows marked `AUTH-SMOKE` remain by design (audit is immutable — cannot be deleted by the client).
- **Honest gaps:** live **factory_manager read-only test is still PENDING** (no factory_manager user created; verified by policy logic only). Old anon smoke scripts (`smoke-supabase.mjs`, `smoke-search.mjs`, `smoke-docs.mjs`) are **expected to fail after `0006`** (anon is blocked) — they are pre-RLS. **`smoke-auth.mjs` is the canonical authenticated smoke test.**

## 6. Known issues and deferred items
- **Storage-delete consistency:** `documentsAdapter.remove`/`removeForSegment` delete the Storage object then the metadata row, but the `storage.remove()` result is NOT checked → a Storage failure can leave an orphaned object (cost only, not user-facing). **Do not change delete behavior during this phase.**
- **factory_manager** live permission test pending.
- **notifications** and **reminders** remain prototype-only (labeled).
- **Real WhatsApp Business API** not implemented.
- **Outlook** integration not implemented.
- **Full user-management UI** deferred (admin manages via Dashboard/SQL).
- Future user management should prefer **deactivation over hard deletion**.
- Permission changes (`is_active`/role) propagate within seconds (PostgREST STABLE-function caching) — converges, not a security hole.

## 7. Locked PART 5 decisions (approved)
- Customer workflow uses **Supabase as the source of truth**; no mock/localStorage operational data in Supabase mode.
- Create a real **`customer_submissions`** table.
- Implement a real **one-time token lifecycle**; store **only token hashes**; return the raw token **only once** (on issue).
- **issue / revoke / replace** require an authenticated, active, authorized employee. **anon must NEVER issue/revoke/replace.**
- Narrowly scoped **`validate_customer_token`** and **`submit_customer_action`** MAY be callable by `anon`. Public functions must derive the permitted case/action **from the stored token** and must NOT trust client-supplied case/action/document identifiers.
- Submissions must be **atomic**; the token must **not be consumed if the business action fails**.
- Prevent duplicate submissions and duplicate signed-policy documents **at the database level**. Do **not** add a global `unique(customer_token_id)` to all `case_documents`; prefer `unique(customer_token_id, document_type)` or a targeted signed-policy uniqueness rule. `customer_submissions` may use `unique(customer_token_id)` (one submission per token).
- **Workflow state is derived centrally** from real Supabase records (no manually-synced state column). Implement centralized `getWorkflowState(caseId)` and `getNextAction(caseId)`. Do NOT duplicate workflow logic across React pages, external pages, the simulator, or future WhatsApp handlers — all consume the SAME shared services.
- External customer pages AND the simulator must use the **same shared services**. The simulator stays a **thin workflow-testing client**, not a standalone WhatsApp implementation.
- notifications and reminders remain clearly labeled prototype modules.
- Visible audit log = **one clear business event per successful action**; technical/security events use a category and must not clutter the default view.
- SECURITY DEFINER functions: fixed safe `search_path`, schema-qualified, `revoke from public`, grant only to required roles, validate `auth.uid()` + active profile for privileged ops, no unsafe dynamic SQL.

## 8. PART 5 implementation sequence
Begin with **PART 5A only:**
1. Inspect the **live schema** + current customer-token/mock adapters after `0005`/`0006`.
2. Create and present **`0007_customer_workflow.sql`** — explain every table alteration, index, constraint, grant, policy, and RPC.
3. **Do NOT apply the migration.** Stop for the user's review and manual application.
4. After confirmation, **verify the live schema**.
5. Only then implement the **shared workflow/token services** (`getWorkflowState`, `getNextAction`, issue/validate/submit).
6. Later connect the **external customer pages** (`/c/$token/*`).
7. Later connect the **simulator** as a thin client.
8. Run build / typecheck / live authenticated + anonymous tests after each part.
9. Create **separate local commits** per sub-part (5A/5B/5C/5D).
10. **Do not push** without explicit approval.

## 9. Git safety rules
- Do NOT amend, squash, rebase, reset, or rewrite existing commits. Do NOT force-push.
- Do NOT touch `sba-returns`.
- Do NOT expose `.env.local` or print credentials.
- Additive migrations only; do NOT edit `0001`–`0006`.
- Do NOT begin unrelated features.

## 10. Opening instruction for the new conversation (paste this)
> Read `CLAUDE_HANDOFF_PART5.md`, verify the repository state against it, and begin PART 5A with inspection and a proposed `0007_customer_workflow.sql`. Do not modify code or apply migrations until the inspection and migration plan are presented.
