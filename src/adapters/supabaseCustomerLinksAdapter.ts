// Supabase adapter לטוקני לקוח + הגשות — מעל ה-RPCs האמיתיים של 0007/0008.
// עקרונות: נתונים בלבד; ללא mock/localStorage; הטוקן הגולמי מוחזר אך ורק מ-issue/replace;
// סקירה רק דרך review_customer_submission (אין UPDATE ישיר); מיפוי snake_case↔camelCase;
// אימות צורת תגובת RPC; וסיווג שגיאות (permission / invalid / expired / business / file).
import { getSupabase } from "@/lib/supabase";
import type { CustomerActionType } from "@/lib/customer-link-types";
import type { DocumentCategory } from "@/lib/document-types";

// ── טיפוסי UI (camelCase) — מבודדים משמות ה-DB ──
export type TokenStatus = "active" | "used" | "expired" | "revoked";
export type SubmissionStatus = "pending_review" | "auto_applied" | "approved" | "rejected";

export interface IssuedToken {
  token: string; // גולמי — פעם אחת בלבד
  tokenId: string;
  action: CustomerActionType;
  documentType: DocumentCategory | null;
  expiresAt: string;
}
export interface TokenValidation {
  valid: boolean;
  reason?: "not_found" | "expired" | "consumed" | "revoked";
  action?: CustomerActionType;
  documentType?: DocumentCategory | null;
  projectName?: string | null;
  site?: string | null;
  expiresAt?: string;
}
export interface SubmitResult {
  ok: true;
  submissionId: string;
  action: CustomerActionType;
  status: "pending_review" | "auto_applied";
}
export interface TokenRecord {
  id: string;
  action: CustomerActionType;
  status: TokenStatus;
  expiresAt: string;
  documentType: DocumentCategory | null;
  segmentId: string | null;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}
export interface SubmissionRecord {
  id: string;
  customerTokenId: string;
  caseId: string | null;
  action: CustomerActionType;
  payload: unknown;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
}

// ── סיווג שגיאות ──
export type CustomerLinkErrorKind =
  | "permission"
  | "not_authorized"
  | "invalid_token"
  | "expired_token"
  | "duplicate_active"
  | "file_validation"
  | "business"
  | "shape"
  | "unknown";

export class CustomerLinkError extends Error {
  kind: CustomerLinkErrorKind;
  constructor(kind: CustomerLinkErrorKind, message: string) {
    super(message);
    this.name = "CustomerLinkError";
    this.kind = kind;
  }
}

function classify(error: { code?: string; message?: string } | null | undefined): CustomerLinkError {
  const msg = error?.message ?? "unknown error";
  const code = error?.code ?? "";
  if (code === "42501" || /permission denied/i.test(msg)) return new CustomerLinkError("permission", msg);
  if (/not authorized/i.test(msg)) return new CustomerLinkError("not_authorized", msg);
  if (/invalid token/i.test(msg)) return new CustomerLinkError("invalid_token", msg);
  if (/token is not usable/i.test(msg)) return new CustomerLinkError("expired_token", msg);
  if (/active token already exists/i.test(msg)) return new CustomerLinkError("duplicate_active", msg);
  if (/object path mismatch|file not found|mime type not permitted|file size not permitted|document type not set/i.test(msg))
    return new CustomerLinkError("file_validation", msg);
  return new CustomerLinkError("business", msg);
}

function asObject(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object") throw new CustomerLinkError("shape", "unexpected RPC response shape");
  return v as Record<string, unknown>;
}

// ── מיפוי DB(snake) → UI(camel) ──
function toTokenRecord(r: Record<string, unknown>): TokenRecord {
  return {
    id: String(r.id),
    action: r.action_type as CustomerActionType,
    status: r.status as TokenStatus,
    expiresAt: String(r.expires_at),
    documentType: (r.document_type as DocumentCategory) ?? null,
    segmentId: (r.segment_id as string) ?? null,
    usedAt: (r.used_at as string) ?? null,
    revokedAt: (r.revoked_at as string) ?? null,
    createdAt: String(r.created_at),
  };
}
function toSubmissionRecord(r: Record<string, unknown>): SubmissionRecord {
  return {
    id: String(r.id),
    customerTokenId: String(r.customer_token_id),
    caseId: (r.return_case_id as string) ?? null,
    action: r.action_type as CustomerActionType,
    payload: r.payload,
    status: r.status as SubmissionStatus,
    submittedAt: String(r.submitted_at),
    reviewedAt: (r.reviewed_at as string) ?? null,
    reviewedBy: (r.reviewed_by as string) ?? null,
    reviewNote: (r.review_note as string) ?? null,
  };
}

export const supabaseCustomerLinksAdapter = {
  /** הנפקת טוקן — מחזיר את הטוקן הגולמי פעם אחת. דורש עובד פעיל תפעולי (נאכף ב-RPC). */
  async issueToken(input: {
    caseId: string;
    action: CustomerActionType;
    segmentId?: string;
    documentType?: DocumentCategory;
    ttlHours?: number;
  }): Promise<IssuedToken> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("issue_customer_token", {
      p_case_id: input.caseId,
      p_action_type: input.action,
      p_segment_id: input.segmentId ?? null,
      p_document_type: input.documentType ?? null,
      p_ttl_hours: input.ttlHours ?? 24,
    });
    if (error) throw classify(error);
    const o = asObject(data);
    if (typeof o.token !== "string" || !o.token || typeof o.token_id !== "string")
      throw new CustomerLinkError("shape", "issue_customer_token: missing token");
    return {
      token: o.token,
      tokenId: o.token_id,
      action: input.action,
      documentType: (o.document_type as DocumentCategory) ?? null,
      expiresAt: String(o.expires_at),
    };
  },

  /** אימות טוקן (anon) — מחזיר מידע מינימלי; אינו צורך את הטוקן. */
  async validateToken(rawToken: string): Promise<TokenValidation> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("validate_customer_token", { p_token: rawToken });
    if (error) throw classify(error);
    const o = asObject(data);
    if (typeof o.valid !== "boolean") throw new CustomerLinkError("shape", "validate_customer_token: missing 'valid'");
    if (!o.valid) return { valid: false, reason: o.reason as TokenValidation["reason"] };
    return {
      valid: true,
      action: o.action_type as CustomerActionType,
      documentType: (o.document_type as DocumentCategory) ?? null,
      projectName: (o.project_name as string) ?? null,
      site: (o.site as string) ?? null,
      expiresAt: o.expires_at ? String(o.expires_at) : undefined,
    };
  },

  /** הגשת פעולת לקוח (anon) — אטומי; ה-RPC גוזר תיק/פעולה/סוג/נתיב מהטוקן. */
  async submitAction(rawToken: string, payload: unknown, objectPath?: string): Promise<SubmitResult> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("submit_customer_action", {
      p_token: rawToken,
      p_payload: payload ?? {},
      p_object_path: objectPath ?? null,
    });
    if (error) throw classify(error);
    const o = asObject(data);
    if (o.ok !== true || typeof o.submission_id !== "string")
      throw new CustomerLinkError("shape", "submit_customer_action: bad response");
    return {
      ok: true,
      submissionId: o.submission_id,
      action: o.action_type as CustomerActionType,
      status: o.status as SubmitResult["status"],
    };
  },

  /** ביטול טוקן (עובד תפעולי). */
  async revokeToken(tokenId: string): Promise<void> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("revoke_customer_token", { p_token_id: tokenId });
    if (error) throw classify(error);
    if (asObject(data).ok !== true) throw new CustomerLinkError("shape", "revoke_customer_token: bad response");
  },

  /** החלפת טוקן (עובד תפעולי) — מחזיר טוקן גולמי חדש פעם אחת. */
  async replaceToken(tokenId: string): Promise<IssuedToken> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("replace_customer_token", { p_token_id: tokenId });
    if (error) throw classify(error);
    const o = asObject(data);
    if (typeof o.token !== "string" || !o.token || typeof o.token_id !== "string")
      throw new CustomerLinkError("shape", "replace_customer_token: missing token");
    return {
      token: o.token,
      tokenId: o.token_id,
      action: o.action_type as CustomerActionType,
      documentType: (o.document_type as DocumentCategory) ?? null,
      expiresAt: String(o.expires_at),
    };
  },

  /** טוקנים של תיק (לתצוגת עובד) — מטא-דאטה בלבד; לעולם לא token_hash/טוקן גולמי. */
  async tokensForCase(caseId: string): Promise<TokenRecord[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("customer_tokens")
      .select("id,action_type,status,expires_at,document_type,segment_id,used_at,revoked_at,created_at")
      .eq("return_case_id", caseId)
      .order("created_at", { ascending: false });
    if (error) throw classify(error);
    return (data ?? []).map(toTokenRecord);
  },

  /** הגשות של תיק (לתצוגת/סקירת עובד). */
  async submissionsForCase(caseId: string): Promise<SubmissionRecord[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("customer_submissions")
      .select("id,customer_token_id,return_case_id,action_type,payload,status,submitted_at,reviewed_at,reviewed_by,review_note")
      .eq("return_case_id", caseId)
      .order("submitted_at", { ascending: false });
    if (error) throw classify(error);
    return (data ?? []).map(toSubmissionRecord);
  },

  /** סקירת הגשה — אך ורק דרך RPC review_customer_submission (אין UPDATE ישיר ל-customer_submissions). */
  async reviewSubmission(
    submissionId: string,
    status: "approved" | "rejected",
    reviewNote?: string,
  ): Promise<void> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("review_customer_submission", {
      p_submission_id: submissionId,
      p_status: status,
      p_review_note: reviewNote ?? null,
    });
    if (error) throw classify(error);
    if (asObject(data).ok !== true) throw new CustomerLinkError("shape", "review_customer_submission: bad response");
  },
};

export type SupabaseCustomerLinksAdapter = typeof supabaseCustomerLinksAdapter;
