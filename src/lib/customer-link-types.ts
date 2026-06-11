export type CustomerActionType =
  | "intake_request"
  | "sign_policy"
  | "schedule"
  | "upload_doc"
  | "cancel_request";

export const CUSTOMER_ACTION_LABELS: Record<CustomerActionType, string> = {
  intake_request: "בקשת החזרה חדשה",
  sign_policy: "חתימה על נוהל החזרה",
  schedule: "תיאום/שינוי תאריך החזרה",
  upload_doc: "העלאת תעודת משלוח/החזרה",
  cancel_request: "בקשת ביטול החזרה",
};

export const CUSTOMER_ACTION_PATHS: Record<CustomerActionType, string> = {
  intake_request: "intake",
  sign_policy: "sign",
  schedule: "schedule",
  upload_doc: "upload",
  cancel_request: "cancel",
};

export interface CustomerLinkToken {
  token: string;
  caseId: string;
  action: CustomerActionType;
  segmentId?: string;
  createdAt: string;
  createdBy: string;
  expiresAt: string;
  consumedAt?: string;
}

export interface CustomerScheduleRequestSegment {
  requestedDate: string;
  note?: string;
}

export type CustomerSubmissionPayload =
  | {
      type: "intake_request";
      customerName: string;
      company: string;
      phone: string;
      project: string;
      site: string;
      equipmentType: "rental" | "customer_owned" | "rental_and_customer";
      note?: string;
    }
  | {
      type: "sign_policy";
      signerName: string;
      signatureDataUrl: string;
      agreed: true;
    }
  | {
      type: "schedule";
      requestedDate?: string;
      window?: "morning" | "afternoon";
      note?: string;
      segments?: CustomerScheduleRequestSegment[];
    }
  | { type: "upload_doc"; documentId: string; title: string }
  | { type: "cancel_request"; reason: string };

export interface CustomerSubmission {
  id: string;
  token: string;
  caseId: string;
  action: CustomerActionType;
  submittedAt: string;
  payload: CustomerSubmissionPayload;
  status: "pending_review" | "auto_applied" | "approved" | "rejected";
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
}

export const TOKEN_TTL_DAYS = 1;

export type TokenValidity =
  | { ok: true; token: CustomerLinkToken }
  | { ok: false; reason: "not_found" | "expired" | "consumed" };

export function getScheduleRequestSegments(
  payload: Extract<CustomerSubmissionPayload, { type: "schedule" }>,
): CustomerScheduleRequestSegment[] {
  if (Array.isArray(payload.segments) && payload.segments.length > 0) {
    return payload.segments;
  }

  if (payload.requestedDate) {
    return [
      {
        requestedDate: payload.requestedDate,
        note: payload.note,
      },
    ];
  }

  return [];
}