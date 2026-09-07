import { computeDelay } from "@/lib/delay";
import type { Project } from "@/lib/queries";
import { STATUS_LABEL, formatBudget, formatDate } from "@/lib/wtf";

/**
 * Renders a project as a portrait image built for WhatsApp and Instagram Stories.
 *
 * The point of the card is that it is not an opinion: the headline number is the
 * project's own promised date measured against reality, and the footer carries the
 * source. Somebody forwarding it is forwarding a citation, which is what keeps this
 * defensible as well as shareable.
 */

const W = 1080;
const H = 1350;

// Read off the app's own tokens so the card cannot drift from the product's look.
const INK = "#12151f";
const PAPER = "#f7f6f4";
const MUTED = "#9aa0ae";
const RED = "#ff5a4d";
const AMBER = "#ffb020";
const GREEN = "#3ecf8e";

const STATUS_COLOUR: Record<Project["status"], string> = {
  planned: MUTED,
  ongoing: AMBER,
  delayed: RED,
  completed: GREEN,
  finished_early: GREEN,
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Greedy wrap that also caps the number of lines, so long names cannot overflow. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1] ?? "";
    while (last && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    if (ctx.measureText(text).width > maxWidth * maxLines) lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  colour: string,
): number {
  ctx.font = "600 26px Inter, system-ui, sans-serif";
  const padX = 24;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 56;
  ctx.fillStyle = colour;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return w;
}

export type ShareCardInput = {
  project: Project;
  /** Publisher of the primary source, printed in the footer as the citation. */
  sourcePublisher?: string | null;
  siteUrl?: string;
};

export async function renderShareCard({
  project,
  sourcePublisher,
  siteUrl = "utpaldaslabs.github.io/WTF-india",
}: ShareCardInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  // The app self-hosts its fonts, so wait for them rather than racing first paint.
  if (document.fonts?.ready) await document.fonts.ready;

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  const pad = 80;
  let y = pad + 20;

  ctx.fillStyle = MUTED;
  ctx.font = "600 24px Inter, system-ui, sans-serif";
  ctx.letterSpacing = "3px";
  ctx.fillText("WE THE FUTURE · INDIA", pad, y);
  ctx.letterSpacing = "0px";
  y += 70;

  // Status, and where it is.
  const statusW = pill(
    ctx,
    STATUS_LABEL[project.status].toUpperCase(),
    pad,
    y,
    STATUS_COLOUR[project.status],
  );
  const place = [project.district, project.state].filter(Boolean).join(", ");
  if (place) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 26px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(place.toUpperCase(), pad + statusW + 24, y + 29);
    ctx.textBaseline = "alphabetic";
  }
  y += 110;

  // Project name, in the display face.
  ctx.fillStyle = PAPER;
  ctx.font = "500 68px Newsreader, Georgia, serif";
  for (const line of wrap(ctx, project.name, W - pad * 2, 4)) {
    y += 78;
    ctx.fillText(line, pad, y);
  }

  // The headline: how late, against its own promised date.
  const delay = computeDelay(project);
  y += 90;
  if (delay && delay.days > 0) {
    ctx.fillStyle = RED;
    ctx.font = "700 150px Inter, system-ui, sans-serif";
    ctx.fillText(delay.days.toLocaleString("en-IN"), pad, y + 110);
    const numW = ctx.measureText(delay.days.toLocaleString("en-IN")).width;
    ctx.fillStyle = PAPER;
    ctx.font = "600 44px Inter, system-ui, sans-serif";
    ctx.fillText("days late", pad + numW + 24, y + 110);
    y += 150;
    ctx.fillStyle = MUTED;
    ctx.font = "400 30px Inter, system-ui, sans-serif";
    ctx.fillText(
      delay.running ? "and still not finished" : "when it was finally handed over",
      pad,
      y + 40,
    );
    y += 70;
  } else {
    ctx.fillStyle = PAPER;
    ctx.font = "500 52px Newsreader, Georgia, serif";
    ctx.fillText(delay?.label ?? "No completion date published", pad, y + 50);
    y += 100;
  }

  // The receipt. Two dates side by side are what turn the headline number from an
  // assertion into something the reader can check, and they fill the space that
  // would otherwise sit empty under a short delay figure.
  const promised = formatDate(project.planned_end_date);
  const settled = project.actual_end_date
    ? formatDate(project.actual_end_date)
    : "Still not finished";
  y += 40;
  const colW = (W - pad * 2) / 2;
  const receipt: Array<[string, string]> = [
    ["PROMISED BY", promised],
    [project.actual_end_date ? "HANDED OVER" : "AS OF TODAY", settled],
  ];
  receipt.forEach(([label, value], index) => {
    const x = pad + index * colW;
    ctx.fillStyle = MUTED;
    ctx.font = "600 22px Inter, system-ui, sans-serif";
    ctx.letterSpacing = "3px";
    ctx.fillText(label, x, y);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = PAPER;
    ctx.font = "500 38px Inter, system-ui, sans-serif";
    ctx.fillText(wrap(ctx, value, colW - 24, 1)[0] ?? value, x, y + 54);
  });

  // Money, anchored above the footer so the card reads the same at any delay length.
  if (project.budget_inr != null) {
    const moneyY = H - 300;
    ctx.fillStyle = MUTED;
    ctx.font = "600 24px Inter, system-ui, sans-serif";
    ctx.letterSpacing = "3px";
    ctx.fillText("PUBLIC MONEY SET ASIDE", pad, moneyY);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = PAPER;
    ctx.font = "600 62px Inter, system-ui, sans-serif";
    ctx.fillText(formatBudget(project.budget_inr), pad, moneyY + 76);
  }

  // Footer: the citation is the whole point, so it gets its own rule.
  const footY = H - 150;
  ctx.strokeStyle = "#2a2f3d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, footY);
  ctx.lineTo(W - pad, footY);
  ctx.stroke();

  ctx.fillStyle = MUTED;
  ctx.font = "400 26px Inter, system-ui, sans-serif";
  const cite = sourcePublisher
    ? `Source: ${sourcePublisher}`
    : project.department
      ? `Source: ${project.department} records`
      : "Source: official records";
  ctx.fillText(wrap(ctx, cite, W - pad * 2, 1)[0] ?? cite, pad, footY + 50);

  ctx.fillStyle = PAPER;
  ctx.font = "600 26px Inter, system-ui, sans-serif";
  ctx.fillText(siteUrl, pad, footY + 96);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not render the card."))),
      "image/png",
    );
  });
}

/**
 * Hands the card to the OS share sheet where that exists (every Android and iOS
 * browser worth caring about), and falls back to a download elsewhere.
 */
export async function shareProjectCard(input: ShareCardInput): Promise<"shared" | "downloaded"> {
  const blob = await renderShareCard(input);
  const file = new File([blob], `${input.project.id}-wtf.png`, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: input.project.name,
      text: `${input.project.name} — checked against official records.`,
    });
    return "shared";
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}
