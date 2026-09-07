import type { Project } from "@/lib/queries";

/**
 * How late a project is, measured against the completion date in its own sanction
 * record. This is the number the whole accountability story rests on, so it is
 * computed in one place and never estimated: a project with no published promised
 * date simply has no delay, rather than a guessed one.
 */
export type Delay = {
  /** Whole days past the promised date. Negative means finished ahead of it. */
  days: number;
  /** True while the project is still unfinished and already past its date. */
  running: boolean;
  /** Short human phrase, e.g. "3 years 2 months late". */
  label: string;
};

const DAY = 24 * 60 * 60 * 1000;

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function phrase(days: number): string {
  const abs = Math.abs(days);
  if (abs < 31) return `${abs} day${abs === 1 ? "" : "s"}`;
  const months = Math.floor(abs / 30.44);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0
    ? `${years} year${years === 1 ? "" : "s"}`
    : `${years} year${years === 1 ? "" : "s"} ${rest} month${rest === 1 ? "" : "s"}`;
}

export function computeDelay(project: Project, now: Date = new Date()): Delay | null {
  const promised = toDate(project.planned_end_date);
  if (!promised) return null;

  // A finished project is judged against the date it actually finished; an
  // unfinished one against today, so the number keeps climbing while it is late.
  const finished = toDate(project.actual_end_date);
  const against = finished ?? now;
  const days = Math.floor((against.getTime() - promised.getTime()) / DAY);

  if (days === 0) return { days: 0, running: false, label: "on time" };
  if (days < 0) {
    return { days, running: false, label: `${phrase(days)} early` };
  }
  return { days, running: !finished, label: `${phrase(days)} late` };
}

/** Ranking weight for the Hall of Shame: lateness scaled by money at stake. */
export function shameScore(project: Project, now: Date = new Date()): number {
  const delay = computeDelay(project, now);
  if (!delay || delay.days <= 0) return 0;
  // Crore, so a ₹6,000 crore metro outranks a ₹2 crore footpath at equal delay.
  const crore = (project.budget_inr ?? 0) / 1e7;
  return delay.days * Math.log10(Math.max(crore, 1) + 1);
}
