import {
  TOKEN_TTL_DAYS,
  type CustomerActionType,
  type CustomerLinkToken,
  type CustomerSubmission,
  type CustomerSubmissionPayload,
  type TokenValidity,
} from "@/lib/customer-link-types";

const TOKENS_KEY = "sba.customer_tokens";
const SUBS_KEY = "sba.customer_submissions";
const EVENT = "sba.customer.changed";

export const CUSTOMER_EVENT = EVENT;
export const CUSTOMER_SYNC_MESSAGE = "sba.external_action_sync";

function readTokens(): CustomerLinkToken[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeTokens(items: CustomerLinkToken[]) {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

function readSubs(): CustomerSubmission[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(SUBS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeSubs(items: CustomerSubmission[]) {
  localStorage.setItem(SUBS_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function getTokensForCase(caseId: string): CustomerLinkToken[] {
  return readTokens()
    .filter((t) => t.caseId === caseId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getToken(token: string): CustomerLinkToken | undefined {
  return readTokens().find((t) => t.token === token);
}

export function validateToken(token: string): TokenValidity {
  // Try to rehydrate from URL hash if a serialized token payload is present
  // (this handles the case where the link was opened in a new tab/origin
  // and localStorage from the creator context isn't visible here).
  rehydrateFromHash();
  const t = getToken(token);
  if (!t) return { ok: false, reason: "not_found" };
  if (t.consumedAt) return { ok: false, reason: "consumed" };
  if (new Date(t.expiresAt).getTime() < Date.now())
    return { ok: false, reason: "expired" };
  return { ok: true, token: t };
}

function rehydrateFromHash() {
  if (typeof window === "undefined") return;
  const hash = window.location.hash;
  if (!hash || !hash.includes("t=")) return;
  try {
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const raw = params.get("t");
    if (!raw) return;
    const bin = atob(decodeURIComponent(raw));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const incoming = JSON.parse(json) as CustomerLinkToken;
    if (!incoming?.token) return;
    const all = readTokens();
    if (all.some((x) => x.token === incoming.token)) return;
    writeTokens([incoming, ...all]);
  } catch {
    // ignore malformed hash
  }
}

/** מסדר טוקן לערך base64 URL-safe לשימוש ב-hash של הקישור */
export function encodeTokenForUrl(t: CustomerLinkToken): string {
  // UTF-8 safe base64 (btoa לבדו נופל על תווים מחוץ ל-Latin1, למשל עברית)
  const bytes = new TextEncoder().encode(JSON.stringify(t));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return encodeURIComponent(btoa(bin));
}

export function createToken(input: {
  caseId: string;
  action: CustomerActionType;
  segmentId?: string;
  createdBy: string;
}): CustomerLinkToken {
  const now = new Date();
  const expires = new Date(now.getTime() + TOKEN_TTL_DAYS * 86_400_000);
  const t: CustomerLinkToken = {
    token: crypto.randomUUID(),
    caseId: input.caseId,
    action: input.action,
    segmentId: input.segmentId,
    createdAt: now.toISOString(),
    createdBy: input.createdBy,
    expiresAt: expires.toISOString(),
  };
  writeTokens([t, ...readTokens()]);
  return t;
}

function consumeToken(token: string) {
  const all = readTokens();
  const idx = all.findIndex((t) => t.token === token);
  if (idx === -1) return;
  all[idx] = { ...all[idx], consumedAt: new Date().toISOString() };
  writeTokens(all);
}

export function getSubmissions(caseId: string): CustomerSubmission[] {
  return readSubs()
    .filter((s) => s.caseId === caseId)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function getAllSubmissions(): CustomerSubmission[] {
  return readSubs();
}

export function getPendingSubmissions(caseId: string): CustomerSubmission[] {
  return getSubmissions(caseId).filter((s) => s.status === "pending_review");
}

/** קובע סטטוס התחלתי לפי סוג הפעולה */
function initialStatus(
  action: CustomerActionType,
): "auto_applied" | "pending_review" {
  return action === "sign_policy" || action === "upload_doc"
    ? "auto_applied"
    : "pending_review";
}

export function addSubmission(input: {
  token: string;
  caseId: string;
  action: CustomerActionType;
  payload: CustomerSubmissionPayload;
}): CustomerSubmission {
  const sub: CustomerSubmission = {
    id: crypto.randomUUID(),
    token: input.token,
    caseId: input.caseId,
    action: input.action,
    submittedAt: new Date().toISOString(),
    payload: input.payload,
    status: initialStatus(input.action),
  };
  writeSubs([sub, ...readSubs()]);
  consumeToken(input.token);
  return sub;
}

export function mergeCustomerState(input: {
  tokens?: CustomerLinkToken[];
  submissions?: CustomerSubmission[];
}) {
  if (input.tokens && input.tokens.length > 0) {
    const merged = new Map<string, CustomerLinkToken>();
    for (const item of readTokens()) merged.set(item.token, item);
    for (const item of input.tokens) merged.set(item.token, item);
    writeTokens(
      Array.from(merged.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  if (input.submissions && input.submissions.length > 0) {
    const merged = new Map<string, CustomerSubmission>();
    for (const item of readSubs()) merged.set(item.id, item);
    for (const item of input.submissions) merged.set(item.id, item);
    writeSubs(
      Array.from(merged.values()).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    );
  }
}

export function setSubmissionStatus(
  id: string,
  status: "approved" | "rejected",
  reviewedBy: string,
  reviewNote?: string,
): CustomerSubmission | undefined {
  const all = readSubs();
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) return undefined;
  all[idx] = {
    ...all[idx],
    status,
    reviewedAt: new Date().toISOString(),
    reviewedBy,
    reviewNote,
  };
  writeSubs(all);
  return all[idx];
}