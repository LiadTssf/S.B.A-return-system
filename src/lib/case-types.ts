export type CaseStatus =
  | "open"
  | "coordinating"
  | "awaiting_return"
  | "in_review"
  | "completed"
  | "cancelled";

export type EquipmentType = "rental" | "customer_owned" | "rental_and_customer";

export interface ReturnCase {
  id: string;
  customer: string;
  project: string;
  site: string;
  equipmentType: EquipmentType;
  status: CaseStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  closedAt?: string;
  closedBy?: string;
}

export const STATUS_LABELS: Record<CaseStatus, string> = {
  open: "פתוח",
  coordinating: "בתיאום",
  awaiting_return: "ממתין להחזרה",
  in_review: "בבדיקה",
  completed: "הושלם",
  cancelled: "מבוטל",
};

export const STATUS_ORDER: CaseStatus[] = [
  "open",
  "coordinating",
  "awaiting_return",
  "in_review",
  "completed",
  "cancelled",
];

export const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
  rental: "שכירות",
  customer_owned: "ציוד לקוח",
  rental_and_customer: "שכירות + ציוד לקוח",
};