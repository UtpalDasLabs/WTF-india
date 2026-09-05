/**
 * Basic public-platform moderation shared by client and server.
 * Profanity is masked with asterisks rather than hidden, so the point a person
 * was making still comes through. Higher severity content is held, blurred or
 * removed instead.
 */

export type ModerationAction = "allow" | "mask" | "hold" | "blur" | "remove";

export type ModerationResult = {
  action: ModerationAction;
  /** Short machine label shown to reviewers and on the review card. */
  label: string;
  /** Plain-English explanation for the person who posted. */
  reason: string;
  maskedText: string;
  severity: "none" | "low" | "medium" | "high";
};

const PROFANITY = [
  "damn",
  "hell",
  "bastard",
  "bloody",
  "crap",
  "shit",
  "fuck",
  "asshole",
  "bitch",
  "chutiya",
  "bhenchod",
  "madarchod",
  "gandu",
  "harami",
  "kutta",
  "saala",
];

const SLUR_OR_HATE = [
  "terrorist scum",
  "go back to your country",
  "subhuman",
  "vermin",
  "kill all",
];

const THREATS = [
  "i will kill",
  "we will kill",
  "burn his house",
  "burn their house",
  "bomb the",
  "shoot him",
  "shoot her",
  "beat him to death",
];

const PERSONAL_DATA = [
  /\b\d{4}\s?\d{4}\s?\d{4}\b/, // aadhaar-like
  /\b[6-9]\d{9}\b/, // indian mobile number
  /\b[A-Z]{5}\d{4}[A-Z]\b/, // pan-like
];

const UNVERIFIED_CLAIM = [
  "took a bribe",
  "bribe",
  "stole",
  "corrupt",
  "scam",
  "fraud",
  "kickback",
];

function maskWord(word: string): string {
  if (word.length <= 2) return "*".repeat(word.length);
  return `${word[0]}${"*".repeat(word.length - 2)}${word[word.length - 1]}`;
}

function maskProfanity(text: string): { masked: string; hits: string[] } {
  const hits: string[] = [];
  const masked = text.replace(/[\p{L}]+/gu, (word) => {
    if (PROFANITY.includes(word.toLowerCase())) {
      hits.push(word.toLowerCase());
      return maskWord(word);
    }
    return word;
  });
  return { masked, hits };
}

export function moderateText(input: string): ModerationResult {
  const text = input.trim();
  const lower = text.toLowerCase();
  const { masked, hits } = maskProfanity(text);

  const hasThreat = THREATS.some((phrase) => lower.includes(phrase));
  if (hasThreat) {
    return {
      action: "remove",
      label: "threat_of_violence",
      reason:
        "This mentions violence against a person, which we cannot publish. Please describe the problem with the work instead.",
      maskedText: masked,
      severity: "high",
    };
  }

  const hasHate = SLUR_OR_HATE.some((phrase) => lower.includes(phrase));
  if (hasHate) {
    return {
      action: "remove",
      label: "hate_speech",
      reason:
        "This attacks a group of people. Feedback about the project itself is welcome.",
      maskedText: masked,
      severity: "high",
    };
  }

  const hasPersonalData = PERSONAL_DATA.some((pattern) => pattern.test(text));
  if (hasPersonalData) {
    return {
      action: "hold",
      label: "personal_data",
      reason:
        "This looks like it contains a phone number or ID number. A reviewer will check before it appears.",
      maskedText: masked.replace(/\d/g, "*"),
      severity: "medium",
    };
  }

  const hasClaim = UNVERIFIED_CLAIM.some((phrase) => lower.includes(phrase));
  if (hasClaim) {
    return {
      action: "hold",
      label: "possible_unverified_claim",
      reason:
        "This makes a serious allegation, so a reviewer will read it before it appears publicly.",
      maskedText: masked,
      severity: "medium",
    };
  }

  if (hits.length > 0) {
    return {
      action: "mask",
      label: "profanity_masked",
      reason:
        "Strong language was masked with asterisks. Your point is still published in full.",
      maskedText: masked,
      severity: "low",
    };
  }

  return {
    action: "allow",
    label: "clean",
    reason: "Nothing flagged.",
    maskedText: masked,
    severity: "none",
  };
}

export type ImageModerationResult = {
  action: Extract<ModerationAction, "allow" | "blur" | "hold" | "remove">;
  label: string;
  reason: string;
};

/** Very light image check used before an image reaches the reviewer queue. */
export function moderateImageMeta(url: string, caption: string): ImageModerationResult {
  const captionCheck = moderateText(caption);
  if (captionCheck.action === "remove") {
    return { action: "remove", label: captionCheck.label, reason: captionCheck.reason };
  }
  if (!/^https?:\/\//i.test(url)) {
    return {
      action: "hold",
      label: "unreadable_image_link",
      reason: "We could not open this image link, so a reviewer will look at it.",
      };
  }
  if (captionCheck.action === "hold") {
    return { action: "hold", label: captionCheck.label, reason: captionCheck.reason };
  }
  return {
    action: "allow",
    label: "photo_pending_ai_check",
    reason:
      "Photo accepted. Automatic safety checking runs in the background and a reviewer can blur or remove it.",
  };
}

export const MODERATION_STATE_LABEL: Record<string, string> = {
  visible: "Published",
  held: "Held for review",
  blurred: "Blurred until checked",
  removed: "Removed",
};
