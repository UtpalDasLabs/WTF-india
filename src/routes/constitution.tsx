import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  BadgeCheck,
  BookOpen,
  ExternalLink,
  Languages,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/wtf/app-shell";
import {
  CONSTITUTION_LANGUAGES,
  CONSTITUTION_PARTS,
  KEY_ARTICLES,
  LANGUAGE_STATUS_LABEL,
  OFFICIAL_SOURCES,
  findLanguage,
} from "@/lib/constitution";
import { cn } from "@/lib/utils";

const STORE_KEY = "wtf.constitution.lang";

export const Route = createFileRoute("/constitution")({
  head: () => ({
    meta: [
      { title: "Constitution of India — read it in your language | We the Future" },
      {
        name: "description",
        content:
          "A calm place to read the Preamble and the structure of the Constitution of India, with official Legislative Department sources and honest notes about which language versions we can confirm.",
      },
      { property: "og:title", content: "Constitution of India — a civic reminder" },
      {
        property: "og:description",
        content:
          "The Preamble, the Parts of the Constitution and the articles that matter for public works, with official sources and clear language status.",
      },
    ],
  }),
  component: ConstitutionPage,
});

function ConstitutionPage() {
  const [code, setCode] = useState("en");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [langFilter, setLangFilter] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORE_KEY);
    if (saved) setCode(saved);
  }, []);

  function choose(next: string) {
    setCode(next);
    window.localStorage.setItem(STORE_KEY, next);
    setPickerOpen(false);
    setLangFilter("");
  }

  const language = findLanguage(code);

  const languages = useMemo(() => {
    const q = langFilter.trim().toLowerCase();
    if (!q) return CONSTITUTION_LANGUAGES;
    return CONSTITUTION_LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.includes(q),
    );
  }, [langFilter]);

  const q = query.trim().toLowerCase();
  const parts = useMemo(
    () =>
      !q
        ? CONSTITUTION_PARTS
        : CONSTITUTION_PARTS.filter((p) =>
            [p.part, p.title, p.articles, p.about].join(" ").toLowerCase().includes(q),
          ),
    [q],
  );
  const articles = useMemo(
    () =>
      !q
        ? KEY_ARTICLES
        : KEY_ARTICLES.filter((a) =>
            [a.article, a.title, a.about].join(" ").toLowerCase().includes(q),
          ),
    [q],
  );

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="rounded-3xl bg-primary-container p-5 text-primary-container-foreground">
          <p className="label-sm flex items-center gap-1.5 opacity-90">
            <BookOpen className="size-4" aria-hidden />
            A civic reminder
          </p>
          <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">
            The Constitution of India
          </h1>
          <p className="mt-2 text-sm leading-relaxed opacity-90">
            Every road, pipeline and hospital in this app exists because of powers and
            duties written down here. Read it slowly. Nothing on this page is our
            wording — the text comes from the official published Constitution, and we
            say plainly when we cannot confirm a language version.
          </p>
        </header>

        {/* Language selection */}
        <section className="rounded-3xl bg-surface-container p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Languages className="size-4" aria-hidden />
              Reading in {language.name}
              {language.nativeName !== language.name ? (
                <span className="text-muted-foreground">({language.nativeName})</span>
              ) : null}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => setPickerOpen((v) => !v)}
              aria-expanded={pickerOpen}
            >
              {pickerOpen ? "Close" : "Change language"}
            </Button>
          </div>

          <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
            {language.status === "in_app" ? (
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-status-delayed" aria-hidden />
            )}
            <span>
              <span className="font-medium text-foreground">
                {LANGUAGE_STATUS_LABEL[language.status]}.
              </span>{" "}
              {language.note}
            </span>
          </p>

          <a
            href={language.source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4"
          >
            {language.source.label}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>

          {pickerOpen ? (
            <div className="mt-4 border-t border-border pt-3">
              <label className="label-sm text-muted-foreground" htmlFor="lang-filter">
                Find a language
              </label>
              <Input
                id="lang-filter"
                value={langFilter}
                onChange={(e) => setLangFilter(e.target.value)}
                placeholder="Tamil, বাংলা, marathi…"
                className="mt-1.5 rounded-2xl"
              />
              <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1">
                {languages.map((l) => {
                  const active = l.code === language.code;
                  return (
                    <li key={l.code}>
                      <button
                        type="button"
                        onClick={() => choose(l.code)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "m3-state flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left",
                          active
                            ? "border-primary bg-secondary-container text-secondary-container-foreground"
                            : "border-outline",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {l.nativeName}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {l.name}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "label-sm shrink-0 rounded-full px-2 py-1",
                            l.status === "in_app"
                              ? "bg-tertiary-container text-tertiary-container-foreground"
                              : "bg-surface-container-high text-muted-foreground",
                          )}
                        >
                          {l.status === "in_app" ? "Text ready" : "Unconfirmed"}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {languages.length === 0 ? (
                  <li className="py-3 text-sm text-muted-foreground">
                    No language matches that.
                  </li>
                ) : null}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                The 22 languages listed in the Eighth Schedule are all shown here. We only
                mark a version as ready when we have checked it against an official
                source, so most are still marked unconfirmed.{" "}
                <a
                  href={OFFICIAL_SOURCES.eighthSchedule.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline underline-offset-4"
                >
                  Eighth Schedule (official)
                </a>
              </p>
            </div>
          ) : null}
        </section>

        {/* Reading pane */}
        <section className="rounded-3xl border border-border bg-surface p-5">
          {language.preamble ? (
            <article>
              <h2 className="text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {language.preambleTitle}
              </h2>
              <div className="mx-auto mt-4 max-w-prose space-y-3 text-[1.02rem] leading-loose">
                {language.preamble.map((line, i) => (
                  <p
                    key={i}
                    className={cn(
                      i === 0 || i === language.preamble!.length - 1
                        ? "text-foreground"
                        : "text-center font-medium text-foreground",
                    )}
                  >
                    {line}
                  </p>
                ))}
              </div>
              <p className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground">
                Source: {language.source.label}. Adopted 26 November 1949; came into force
                26 January 1950.
              </p>
            </article>
          ) : (
            <div className="mx-auto max-w-prose text-center">
              <AlertCircle className="mx-auto size-6 text-status-delayed" aria-hidden />
              <h2 className="mt-2 text-base font-semibold">
                We do not have a confirmed {language.name} text yet
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {language.note}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button asChild className="rounded-full">
                  <a
                    href={OFFICIAL_SOURCES.regional.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Open the official language list
                  </a>
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => choose("en")}
                >
                  Read in English
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Navigation through the document */}
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Find your way around</h2>
            <p className="text-sm text-muted-foreground">
              The Constitution is organised into Parts. Search a topic, a Part or an
              article number.
            </p>
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="water, municipalities, Article 21…"
              aria-label="Search the Constitution contents"
              className="rounded-2xl pl-9"
            />
          </div>

          {articles.length > 0 ? (
            <div>
              <h3 className="label-sm text-muted-foreground">
                Articles worth knowing as a citizen
              </h3>
              <ul className="mt-2 space-y-2">
                {articles.map((a) => (
                  <li
                    key={a.article}
                    className="rounded-2xl bg-surface-container p-3.5"
                  >
                    <p className="text-sm font-semibold">
                      {a.article} — {a.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{a.about}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {parts.length > 0 ? (
            <div>
              <h3 className="label-sm text-muted-foreground">Contents by Part</h3>
              <ol className="mt-2 space-y-2">
                {parts.map((p) => (
                  <li key={p.part} className="rounded-2xl border border-border p-3.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {p.part} — {p.title}
                      </p>
                      <span className="label-sm rounded-full bg-surface-container-high px-2 py-0.5 text-muted-foreground">
                        {p.articles}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{p.about}</p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {parts.length === 0 && articles.length === 0 ? (
            <p className="rounded-2xl bg-surface-container p-4 text-sm text-muted-foreground">
              Nothing here matches “{query}”. The full official text has far more detail —
              open the official Constitution page to search all of it.
            </p>
          ) : null}
        </section>

        <section className="rounded-3xl bg-surface-container p-4">
          <h2 className="text-sm font-semibold">Where this comes from</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We do not host our own copy of the Constitution. Everything above points back
            to the Legislative Department, Ministry of Law and Justice, which publishes the
            official text.
          </p>
          <ul className="mt-3 space-y-2">
            {[OFFICIAL_SOURCES.constitution, OFFICIAL_SOURCES.regional].map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-start gap-1.5 text-sm font-medium text-primary underline underline-offset-4"
                >
                  {s.label}
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
