export type ProjectStatus = "planned" | "ongoing" | "delayed" | "completed" | "finished_early";

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
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type CityOption = {
  name: string;
  state: string;
  lat: number;
  lng: number;
  /** Other spellings, district names and nearby names that mean the same place. */
  aliases?: string[];
};

export const INDIAN_CITIES: CityOption[] = [
  {
    name: "Kolkata",
    state: "West Bengal",
    lat: 22.5726,
    lng: 88.3639,
    aliases: ["calcutta", "howrah", "salt lake", "kmc"],
  },
  {
    name: "Gurugram",
    state: "Haryana",
    lat: 28.4595,
    lng: 77.0266,
    aliases: ["gurgaon", "manesar"],
  },
  {
    name: "Noida",
    state: "Uttar Pradesh",
    lat: 28.5355,
    lng: 77.391,
    aliases: ["greater noida", "gautam buddh nagar"],
  },
  { name: "Ghaziabad", state: "Uttar Pradesh", lat: 28.6692, lng: 77.4538 },
  { name: "Faridabad", state: "Haryana", lat: 28.4089, lng: 77.3178 },
  {
    name: "Chandigarh",
    state: "Chandigarh",
    lat: 30.7333,
    lng: 76.7794,
    aliases: ["mohali", "panchkula"],
  },
  { name: "Vadodara", state: "Gujarat", lat: 22.3072, lng: 73.1812, aliases: ["baroda"] },
  { name: "Rajkot", state: "Gujarat", lat: 22.3039, lng: 70.8022 },
  { name: "Nashik", state: "Maharashtra", lat: 19.9975, lng: 73.7898, aliases: ["nasik"] },
  {
    name: "Chhatrapati Sambhajinagar",
    state: "Maharashtra",
    lat: 19.8762,
    lng: 75.3433,
    aliases: ["aurangabad"],
  },
  { name: "Amritsar", state: "Punjab", lat: 31.634, lng: 74.8723 },
  { name: "Jalandhar", state: "Punjab", lat: 31.326, lng: 75.5762 },
  { name: "Raipur", state: "Chhattisgarh", lat: 21.2514, lng: 81.6296, aliases: ["naya raipur"] },
  { name: "Dehradun", state: "Uttarakhand", lat: 30.3165, lng: 78.0322 },
  { name: "Jamshedpur", state: "Jharkhand", lat: 22.8046, lng: 86.2029, aliases: ["tatanagar"] },
  { name: "Gwalior", state: "Madhya Pradesh", lat: 26.2183, lng: 78.1828 },
  { name: "Jabalpur", state: "Madhya Pradesh", lat: 23.1815, lng: 79.9864 },
  {
    name: "Vijayawada",
    state: "Andhra Pradesh",
    lat: 16.5062,
    lng: 80.648,
    aliases: ["amaravati"],
  },
  { name: "Guntur", state: "Andhra Pradesh", lat: 16.3067, lng: 80.4365 },
  { name: "Tiruchirappalli", state: "Tamil Nadu", lat: 10.7905, lng: 78.7047, aliases: ["trichy"] },
  { name: "Salem", state: "Tamil Nadu", lat: 11.6643, lng: 78.146 },
  { name: "Mangaluru", state: "Karnataka", lat: 12.9141, lng: 74.856, aliases: ["mangalore"] },
  {
    name: "Hubballi",
    state: "Karnataka",
    lat: 15.3647,
    lng: 75.124,
    aliases: ["hubli", "dharwad"],
  },
  { name: "Kozhikode", state: "Kerala", lat: 11.2588, lng: 75.7804, aliases: ["calicut"] },
  { name: "Siliguri", state: "West Bengal", lat: 26.7271, lng: 88.3953 },
  { name: "Durgapur", state: "West Bengal", lat: 23.5204, lng: 87.3119, aliases: ["asansol"] },
  { name: "Cuttack", state: "Odisha", lat: 20.4625, lng: 85.8828 },
  { name: "Rourkela", state: "Odisha", lat: 22.2604, lng: 84.8536 },
  { name: "Kota", state: "Rajasthan", lat: 25.2138, lng: 75.8648 },
  { name: "Udaipur", state: "Rajasthan", lat: 24.5854, lng: 73.7125 },
  { name: "Muzaffarpur", state: "Bihar", lat: 26.1209, lng: 85.3647 },
  { name: "Gaya", state: "Bihar", lat: 24.7955, lng: 85.0002 },
  { name: "Jammu", state: "Jammu and Kashmir", lat: 32.7266, lng: 74.857 },
  { name: "Shimla", state: "Himachal Pradesh", lat: 31.1048, lng: 77.1734 },
  { name: "Panaji", state: "Goa", lat: 15.4909, lng: 73.8278, aliases: ["panjim", "goa"] },
  { name: "Puducherry", state: "Puducherry", lat: 11.9416, lng: 79.8083, aliases: ["pondicherry"] },
  { name: "Imphal", state: "Manipur", lat: 24.817, lng: 93.9368 },
  { name: "Agartala", state: "Tripura", lat: 23.8315, lng: 91.2868 },
  { name: "Aizawl", state: "Mizoram", lat: 23.7271, lng: 92.7176 },
  { name: "Itanagar", state: "Arunachal Pradesh", lat: 27.0844, lng: 93.6053 },
  { name: "Kohima", state: "Nagaland", lat: 25.6751, lng: 94.1086 },
  { name: "Gangtok", state: "Sikkim", lat: 27.3389, lng: 88.6065 },
  {
    name: "Mumbai",
    state: "Maharashtra",
    lat: 19.076,
    lng: 72.8777,
    aliases: ["bombay", "mumbai suburban", "mumbai city", "navi mumbai"],
  },
  {
    name: "Pune",
    state: "Maharashtra",
    lat: 18.5204,
    lng: 73.8567,
    aliases: ["poona", "pimpri", "chinchwad"],
  },
  { name: "Nagpur", state: "Maharashtra", lat: 21.1458, lng: 79.0882 },
  {
    name: "Delhi",
    state: "Delhi",
    lat: 28.6139,
    lng: 77.209,
    aliases: ["new delhi", "dwarka", "ncr"],
  },
  {
    name: "Bengaluru",
    state: "Karnataka",
    lat: 12.9716,
    lng: 77.5946,
    aliases: ["bangalore", "bengaluru urban", "bengaluru rural", "bbmp"],
  },
  { name: "Mysuru", state: "Karnataka", lat: 12.2958, lng: 76.6394, aliases: ["mysore"] },
  { name: "Chennai", state: "Tamil Nadu", lat: 13.0827, lng: 80.2707, aliases: ["madras"] },
  {
    name: "Coimbatore",
    state: "Tamil Nadu",
    lat: 10.9925,
    lng: 76.9614,
    aliases: ["kovai", "ukkadam"],
  },
  { name: "Madurai", state: "Tamil Nadu", lat: 9.9252, lng: 78.1198 },
  { name: "Sivakasi", state: "Tamil Nadu", lat: 9.4533, lng: 77.7987, aliases: ["virudhunagar"] },
  { name: "Kochi", state: "Kerala", lat: 9.9312, lng: 76.2673, aliases: ["cochin", "ernakulam"] },
  {
    name: "Thiruvananthapuram",
    state: "Kerala",
    lat: 8.5241,
    lng: 76.9366,
    aliases: ["trivandrum", "vizhinjam"],
  },
  {
    name: "Hyderabad",
    state: "Telangana",
    lat: 17.385,
    lng: 78.4867,
    aliases: ["secunderabad", "rangareddy"],
  },
  {
    name: "Visakhapatnam",
    state: "Andhra Pradesh",
    lat: 17.6868,
    lng: 83.2185,
    aliases: ["vizag"],
  },
  {
    name: "Ahmedabad",
    state: "Gujarat",
    lat: 23.0225,
    lng: 72.5714,
    aliases: ["amdavad", "gandhinagar"],
  },
  { name: "Surat", state: "Gujarat", lat: 21.1702, lng: 72.8311 },
  { name: "Jaipur", state: "Rajasthan", lat: 26.9124, lng: 75.7873 },
  { name: "Jodhpur", state: "Rajasthan", lat: 26.2389, lng: 73.0243, aliases: ["barmer"] },
  { name: "Lucknow", state: "Uttar Pradesh", lat: 26.8467, lng: 80.9462, aliases: ["sitapur"] },
  {
    name: "Varanasi",
    state: "Uttar Pradesh",
    lat: 25.3176,
    lng: 82.9739,
    aliases: ["banaras", "kashi"],
  },
  { name: "Kanpur", state: "Uttar Pradesh", lat: 26.4499, lng: 80.3319, aliases: ["kanpur nagar"] },
  { name: "Agra", state: "Uttar Pradesh", lat: 27.1767, lng: 78.0081 },
  { name: "Ghazipur", state: "Uttar Pradesh", lat: 25.5837, lng: 83.5776 },
  { name: "Patna", state: "Bihar", lat: 25.5941, lng: 85.1376, aliases: ["nalanda"] },
  { name: "Ranchi", state: "Jharkhand", lat: 23.3441, lng: 85.3096 },
  {
    name: "Bhubaneswar",
    state: "Odisha",
    lat: 20.2961,
    lng: 85.8245,
    aliases: ["khordha", "khurda"],
  },
  { name: "Indore", state: "Madhya Pradesh", lat: 22.7196, lng: 75.8577 },
  { name: "Bhopal", state: "Madhya Pradesh", lat: 23.2599, lng: 77.4126 },
  { name: "Ludhiana", state: "Punjab", lat: 30.901, lng: 75.8573 },
  { name: "Srinagar", state: "Jammu and Kashmir", lat: 34.0837, lng: 74.7973 },
  { name: "Guwahati", state: "Assam", lat: 26.1445, lng: 91.7362, aliases: ["nagaon", "kamrup"] },
  {
    name: "Shillong",
    state: "Meghalaya",
    lat: 25.5788,
    lng: 91.8933,
    aliases: ["east khasi hills"],
  },
];

/** Lowercase, strip accents and punctuation so "Bengaluru Urban" matches "bengaluru". */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type PlaceFields = {
  name?: string | null;
  state?: string | null;
  district?: string | null;
  plain_summary?: string | null;
  department?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

/** How far from a chosen city we still treat a project as "in" that city. */
export const CITY_RADIUS_KM = 60;

/**
 * True when a project belongs to the chosen city. Name and district text is
 * matched on normalized words, and anything within CITY_RADIUS_KM counts too,
 * so records that spell the district differently still show up.
 */
export function projectInCity(project: PlaceFields, city: CityOption): boolean {
  const needles = [city.name, ...(city.aliases ?? [])].map(normalizeText).filter(Boolean);
  const haystack = normalizeText(
    [project.district, project.state, project.name, project.plain_summary, project.department]
      .filter(Boolean)
      .join(" "),
  );
  if (needles.some((needle) => haystack.includes(needle))) return true;

  if (project.latitude != null && project.longitude != null) {
    return distanceKm(city.lat, city.lng, project.latitude, project.longitude) <= CITY_RADIUS_KM;
  }
  return false;
}

/** Finds a city from free text typed into the search box. */
export function matchCityByText(text: string): CityOption | null {
  const query = normalizeText(text);
  if (query.length < 3) return null;
  return (
    INDIAN_CITIES.find((city) =>
      [city.name, ...(city.aliases ?? [])].some((label) => normalizeText(label) === query),
    ) ??
    INDIAN_CITIES.find((city) =>
      [city.name, ...(city.aliases ?? [])].some((label) => normalizeText(label).startsWith(query)),
    ) ??
    null
  );
}

export type ConditionRating = "good" | "mixed" | "poor";

export const CONDITION_LABEL: Record<ConditionRating, string> = {
  good: "Good today",
  mixed: "Mixed today",
  poor: "Poor today",
};

export const CONDITION_CLASS: Record<ConditionRating, string> = {
  good: "bg-status-completed-container text-status-completed",
  mixed: "bg-status-delayed-container text-status-delayed",
  poor: "bg-destructive-container text-destructive-container-foreground",
};

export const SUGGEST_CATEGORIES = [
  "Roads",
  "Urban transport",
  "Water and sanitation",
  "Health",
  "Education",
  "Electricity",
  "Housing",
  "Flood control",
  "Parks and public spaces",
  "Other",
];
