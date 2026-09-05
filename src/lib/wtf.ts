export type ProjectStatus =
  | "planned"
  | "ongoing"
  | "delayed"
  | "completed"
  | "finished_early";

export type VerifyStatus = "unverified" | "pending_review" | "verified" | "rejected";

export type SourceType =
  | "government_portal"
  | "tender_document"
  | "budget_document"
  | "press_release"
  | "audit_report"
  | "news_report"
  | "rti_response";

export type ModerationState = "visible" | "held" | "blurred" | "removed";

export const STATUS_ORDER: ProjectStatus[] = [
  "planned",
  "ongoing",
  "delayed",
  "completed",
  "finished_early",
];

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Planned",
  ongoing: "Ongoing",
  delayed: "Delayed",
  completed: "Completed",
  finished_early: "Finished early",
};

export const STATUS_CLASS: Record<ProjectStatus, string> = {
  planned: "bg-status-planned-container text-status-planned",
  ongoing: "bg-status-ongoing-container text-status-ongoing",
  delayed: "bg-status-delayed-container text-status-delayed",
  completed: "bg-status-completed-container text-status-completed",
  finished_early: "bg-status-early-container text-status-early",
};

export const STATUS_DOT: Record<ProjectStatus, string> = {
  planned: "bg-status-planned",
  ongoing: "bg-status-ongoing",
  delayed: "bg-status-delayed",
  completed: "bg-status-completed",
  finished_early: "bg-status-early",
};

export const VERIFY_LABEL: Record<VerifyStatus, string> = {
  unverified: "Not checked yet",
  pending_review: "Awaiting reviewer check",
  verified: "Verified against official sources",
  rejected: "Rejected by reviewer",
};

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  government_portal: "Government portal",
  tender_document: "Tender document",
  budget_document: "Budget document",
  press_release: "Official press release",
  audit_report: "Audit report",
  news_report: "News report",
  rti_response: "RTI response",
};

export function formatBudget(value: number | null | undefined): string {
  if (value == null) return "Not published";
  if (value >= 1e7) {
    const crore = value / 1e7;
    return `₹${crore >= 100 ? Math.round(crore).toLocaleString("en-IN") : crore.toFixed(1)} crore`;
  }
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(1)} lakh`;
  return `₹${value.toLocaleString("en-IN")}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Not published";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not published";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function confidencePercent(value: number | null | undefined): number {
  return Math.round((value ?? 0) * 100);
}

/** Straight-line distance in km between two coordinates. */
export function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const INDIAN_CITIES = [
  { name: "Mumbai", state: "Maharashtra", lat: 19.076, lng: 72.8777 },
  { name: "Delhi", state: "Delhi", lat: 28.6139, lng: 77.209 },
  { name: "Bengaluru", state: "Karnataka", lat: 12.9716, lng: 77.5946 },
  { name: "Chennai", state: "Tamil Nadu", lat: 13.0827, lng: 80.2707 },
  { name: "Kochi", state: "Kerala", lat: 9.9312, lng: 76.2673 },
  { name: "Jaipur", state: "Rajasthan", lat: 26.9124, lng: 75.7873 },
  { name: "Lucknow", state: "Uttar Pradesh", lat: 26.8467, lng: 80.9462 },
  { name: "Guwahati", state: "Assam", lat: 26.1445, lng: 91.7362 },
];
