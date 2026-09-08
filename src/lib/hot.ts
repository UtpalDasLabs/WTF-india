import { computeDelay } from "@/lib/delay";
import type { Project } from "@/lib/queries";

/**
 * What is hot right now.
 *
 * Reddit's insight is that "hot" is not "best" and not "newest" — it is what
 * people are looking at *today*, with a decay so nothing sits at the top for
 * ever. The same shape works here, with one change that matters: the substance
 * of a civic project is not how many people shouted about it, so the score is
 * anchored on facts (how far past its own promised date it is, how much public
 * money is on it) and only *nudged* by activity. A brigade can move a project up
 * the page a little; it cannot invent a delay.
 *
 * Everything here is derived from the record, so the ordering can be explained
 * to somebody who asks why their project is not at the top.
 */

const DAY = 24 * 60 * 60 * 1000;
/** How long it takes activity to lose half its weight. */
const HALF_LIFE_DAYS = 30;

export type Heat = {
  score: number;
  /** Why this is on the page, in one short phrase. */
  reason: string;
};

export function heatOf(
  project: Project,
  activity: { count: number } | null | undefined,
  now: Date = new Date(),
): Heat {
  const delay = computeDelay(project, now);
  const crore = (project.budget_inr ?? 0) / 1e7;

  // Lateness is the substance. Logarithmic, so a project three years late is
  // clearly hotter than one three months late without a decade-old one burying
  // everything else for ever.
  const lateness = delay && delay.days > 0 ? Math.log10(delay.days + 1) * 10 : 0;

  // Money at stake, on the same log footing: a ₹6,000 crore metro should outrank
  // a ₹2 crore footpath that is equally late.
  const money = Math.log10(Math.max(crore, 1) + 1) * 4;

  // Activity, decayed. Capped so a burst of reviews cannot outweigh the facts.
  const verified = project.last_verified_at
    ? (now.getTime() - new Date(project.last_verified_at).getTime()) / DAY
    : Number.POSITIVE_INFINITY;
  const freshness = Number.isFinite(verified) ? 2 ** (-verified / HALF_LIFE_DAYS) : 0;
  const talk = Math.min(activity?.count ?? 0, 25);
  const buzz = Math.log10(talk + 1) * 6 * (0.35 + 0.65 * freshness);

  const reason =
    delay && delay.days > 0
      ? `${delay.label}`
      : talk > 0
        ? `${talk} ${talk === 1 ? "person has" : "people have"} weighed in`
        : project.status === "completed" || project.status === "finished_early"
          ? "recently finished"
          : "being watched";

  return { score: lateness + money + buzz, reason };
}

/** Hottest first. Ties break on name so the order is stable between renders. */
export function rankByHeat(
  projects: Project[],
  activity: Record<string, { count: number }> | undefined,
  now: Date = new Date(),
): Array<{ project: Project; heat: Heat }> {
  return projects
    .map((project) => ({ project, heat: heatOf(project, activity?.[project.id], now) }))
    .sort((a, b) => b.heat.score - a.heat.score || a.project.name.localeCompare(b.project.name));
}
