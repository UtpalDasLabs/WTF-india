import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  focus: z.string().min(3).max(200),
});

const candidateSchema = z.object({
  name: z.string().min(4),
  plain_summary: z.string().min(10),
  department: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  proposed_status: z
    .enum(["planned", "ongoing", "delayed", "completed", "finished_early"])
    .nullable()
    .optional(),
  budget_inr: z.number().nullable().optional(),
  agent_confidence: z.number().min(0).max(1),
  agent_notes: z.string().nullable().optional(),
  citations: z
    .array(
      z.object({
        title: z.string(),
        url: z.string().url(),
        source_type: z.enum([
          "government_portal",
          "tender_document",
          "budget_document",
          "press_release",
          "audit_report",
          "news_report",
          "rti_response",
        ]),
        evidence: z.string(),
      }),
    )
    .min(1),
});

const SYSTEM_PROMPT = `You are the research agent for "We the Future", a civic app about Indian government projects.
Rules you must follow:
- Only propose projects that plausibly exist in official Indian government records.
- Every proposal MUST carry at least one citation pointing to an official source domain (gov.in, nic.in, a state department site, a metro rail corporation site, PIB, CAG, or an official tender portal).
- Copy a short evidence quote or a factual paraphrase for each citation.
- Write plain_summary in simple English a first-time reader understands. No jargon.
- Never invent budgets or dates you cannot attribute. Use null instead.
- agent_confidence must honestly reflect how sure you are (0 to 1).
- You are only proposing candidates. A human reviewer verifies before anything is published.
Return JSON only: { "candidates": [ ... ] } with 3 to 5 items.`;

export const runResearchAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: {
        from: (table: string) => any;
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }>;
      };
      userId: string;
    };

    const { data: isReviewer } = await supabase.rpc("is_reviewer", {
      _user_id: userId,
    });
    if (!isReviewer) {
      throw new Error("Only reviewers can run the research agent.");
    }

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("The research agent is not configured yet.");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Find candidate government projects for: ${data.focus}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`AI gateway failed [${response.status}]: ${body}`);
      throw new Error(
        response.status === 429
          ? "The research agent is busy right now. Try again shortly."
          : "The research agent could not complete this run.",
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("The research agent returned something unreadable.");
    }

    const candidates = z
      .object({ candidates: z.array(candidateSchema) })
      .parse(parsed).candidates;

    const officialDomains = [
      ".gov.in",
      ".nic.in",
      "pib.gov.in",
      "cag.gov.in",
      "kride.in",
      "kochimetro.org",
      "chennaimetrorail.org",
      "upeida.up.gov.in",
    ];

    const rows = candidates
      .map((candidate) => ({
        ...candidate,
        citations: candidate.citations.filter((citation) =>
          officialDomains.some((domain) => citation.url.includes(domain)),
        ),
      }))
      .filter((candidate) => candidate.citations.length > 0)
      .map((candidate) => ({
        name: candidate.name,
        plain_summary: candidate.plain_summary,
        department: candidate.department ?? null,
        state: candidate.state ?? null,
        district: candidate.district ?? null,
        proposed_status: candidate.proposed_status ?? null,
        budget_inr: candidate.budget_inr ?? null,
        citations: candidate.citations,
        agent_confidence: candidate.agent_confidence,
        agent_notes: candidate.agent_notes ?? null,
        discovered_from: `Research agent run: ${data.focus}`,
        review_state: "discovered" as const,
      }));

    if (rows.length === 0) {
      return { inserted: 0, dropped: candidates.length };
    }

    const { error } = await supabase.from("candidate_projects").insert(rows);
    if (error) throw new Error(error.message);

    return { inserted: rows.length, dropped: candidates.length - rows.length };
  });
