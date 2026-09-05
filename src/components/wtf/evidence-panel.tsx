import { ExternalLink, FileText, Quote } from "lucide-react";

import { VerificationChip } from "@/components/wtf/status-chip";
import type { ProjectSource } from "@/lib/queries";
import { SOURCE_TYPE_LABEL, confidencePercent, formatDate } from "@/lib/wtf";

export function EvidencePanel({
  sources,
  loading = false,
}: {
  sources: ProjectSource[];
  loading?: boolean;
}) {
  void loading;
  return (
    <section
      aria-labelledby="evidence-heading"
      className="rounded-3xl border border-border bg-surface-container-high p-4"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-container text-primary-container-foreground">
          <FileText className="size-4.5" aria-hidden />
        </span>
        <div>
          <h2 id="evidence-heading" className="text-base font-semibold">
            Where these facts come from
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every fact above is taken from an official document or portal. Nothing on
            this list comes from community posts.
          </p>
        </div>
      </div>

      {sources.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-surface-container p-4 text-sm text-muted-foreground">
          No official source has been attached yet, so this project is not shown as
          verified.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {sources.map((source) => (
            <li key={source.id} className="rounded-2xl bg-surface-container p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="label-sm rounded-full bg-secondary-container px-2 py-0.5 text-secondary-container-foreground">
                  {SOURCE_TYPE_LABEL[source.source_type]}
                </span>
                <VerificationChip status={source.verification_status} />
              </div>

              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 inline-flex items-start gap-1.5 text-sm font-medium text-primary underline underline-offset-4"
              >
                {source.title}
                <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              </a>
              {source.publisher ? (
                <p className="text-xs text-muted-foreground">
                  Published by {source.publisher}
                </p>
              ) : null}

              {source.extracted_evidence ? (
                <blockquote className="mt-3 flex gap-2 rounded-xl bg-surface-container-highest p-3 text-sm">
                  <Quote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span>{source.extracted_evidence}</span>
                </blockquote>
              ) : null}

              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Confidence</dt>
                  <dd className="font-medium">{confidencePercent(source.confidence)}%</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last checked</dt>
                  <dd className="font-medium">{formatDate(source.last_verified_at)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
