// Mock adapter לקישורים חד-פעמיים והגשות לקוח — נתוני דמה ב-localStorage.
// TODO: Replace with Supabase (טבלת customer_tokens עם token_hash, expires_at, used_at).
//       חשוב: אסור לייצר טוקני פרודקשן בצד לקוח בלבד.
import * as store from "./mock/customer-link-store";
import { SUPABASE_ENABLED } from "./config";
import type {
  CustomerActionType,
  CustomerLinkToken,
  CustomerSubmission,
  CustomerSubmissionPayload,
  TokenValidity,
} from "@/lib/customer-link-types";

export const CUSTOMER_EVENT = store.CUSTOMER_EVENT;
export const CUSTOMER_SYNC_MESSAGE = store.CUSTOMER_SYNC_MESSAGE;

export const mockCustomerLinksAdapter = {
  async tokensForCase(caseId: string): Promise<CustomerLinkToken[]> {
    if (SUPABASE_ENABLED) return []; // עדיין לא הוגר — מונע דליפת seed
    return store.getTokensForCase(caseId);
  },
  async getToken(token: string): Promise<CustomerLinkToken | null> {
    return store.getToken(token) ?? null;
  },
  async validateToken(token: string): Promise<TokenValidity> {
    return store.validateToken(token);
  },
  async createToken(input: {
    caseId: string;
    action: CustomerActionType;
    segmentId?: string;
    createdBy: string;
  }): Promise<CustomerLinkToken> {
    return store.createToken(input);
  },
  async submissionsForCase(caseId: string): Promise<CustomerSubmission[]> {
    if (SUPABASE_ENABLED) return [];
    return store.getSubmissions(caseId);
  },
  async allSubmissions(): Promise<CustomerSubmission[]> {
    if (SUPABASE_ENABLED) return [];
    return store.getAllSubmissions();
  },
  async pendingForCase(caseId: string): Promise<CustomerSubmission[]> {
    if (SUPABASE_ENABLED) return [];
    return store.getPendingSubmissions(caseId);
  },
  async addSubmission(input: {
    token: string;
    caseId: string;
    action: CustomerActionType;
    payload: CustomerSubmissionPayload;
  }): Promise<CustomerSubmission> {
    return store.addSubmission(input);
  },
  async setSubmissionStatus(
    id: string,
    status: "approved" | "rejected",
    reviewedBy: string,
    reviewNote?: string,
  ): Promise<CustomerSubmission | null> {
    return store.setSubmissionStatus(id, status, reviewedBy, reviewNote) ?? null;
  },
  mergeState: store.mergeCustomerState,
  encodeTokenForUrl: store.encodeTokenForUrl,
  subscribe(cb: () => void): () => void {
    const h = () => cb();
    window.addEventListener(CUSTOMER_EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(CUSTOMER_EVENT, h);
      window.removeEventListener("storage", h);
    };
  },
};

export type CustomerLinksAdapter = typeof mockCustomerLinksAdapter;
