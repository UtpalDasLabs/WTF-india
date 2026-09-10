import { useEffect, useRef, useState } from "react";
import { ArrowDown, Check } from "lucide-react";

import { findLanguage, OFFICIAL_SOURCES } from "@/lib/constitution";
import { cn } from "@/lib/utils";

/**
 * The Preamble, read once, before anything else.
 *
 * It is already an oath — "WE, THE PEOPLE OF INDIA, having solemnly resolved" —
 * and this app only makes sense to somebody who means it. So a first-time
 * reader is shown the words the country wrote for itself before being shown a
 * single figure about how the country's money was spent.
 *
 * Two rules, both about not making it a formality. The button does not appear
 * until the text has actually been scrolled to the end, so it cannot be tapped
 * past. And the text is quoted exactly, from the version published by the
 * Legislative Department, with the source named — the same standard every other
 * fact in this app is held to.
 */
export function Oath({ onTake }: { onTake: () => void }) {
  const english = findLanguage("en");
  const lines = english.preamble ?? [];
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [read, setRead] = useState(false);

  // A short preamble on a tall screen never scrolls, and then the button would
  // never arrive. Measuring on mount covers that case honestly.
  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const check = () => {
      const atEnd =
        element.scrollTop + element.clientHeight >= element.scrollHeight - 24 ||
        element.scrollHeight <= element.clientHeight + 24;
      if (atEnd) setRead(true);
    };
    check();
    element.addEventListener("scroll", check, { passive: true });
    return () => element.removeEventListener("scroll", check);
  }, []);

  return (
    <div className="flex h-[100dvh] flex-col bg-ink text-ink-foreground">
      <div className="px-6 pt-[max(2rem,env(safe-area-inset-top))] md:px-10">
        <p className="eyebrow text-ink-muted">Before anything else</p>
        <h1 className="display-lg mt-3 text-balance">
          {english.preambleTitle ?? "Preamble"} to the Constitution of India
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">
          This app exists to check what was done with public money. That is only worth doing if you
          mean this. Read it, then say so.
        </p>
      </div>

      <div
        ref={scrollerRef}
        className="relative mt-6 min-h-0 flex-1 overflow-y-auto px-6 md:px-10"
        tabIndex={0}
        aria-label="Preamble to the Constitution of India"
      >
        <div className="border-l-2 border-ink-line pl-5">
          {lines.map((line, index) => (
            <p
              key={line}
              className={cn(
                "font-display leading-relaxed text-ink-foreground",
                index === 0 || index === lines.length - 1
                  ? "mt-4 text-lg first:mt-0 sm:text-xl"
                  : "mt-3 text-base sm:text-lg",
              )}
            >
              {line}
            </p>
          ))}
        </div>

        <p className="mt-8 pb-6 text-xs leading-relaxed text-ink-muted">
          Quoted from{" "}
          <a
            href={OFFICIAL_SOURCES.preamble.url}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2"
          >
            {OFFICIAL_SOURCES.preamble.label}
          </a>
          .
        </p>
      </div>

      <div className="border-t border-ink-line px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 md:px-10">
        {read ? (
          <button
            type="button"
            onClick={onTake}
            className="m3-state flex w-full items-center justify-center gap-2 rounded-full bg-ink-foreground px-5 py-3.5 text-sm font-semibold text-ink hover:opacity-90"
          >
            <Check className="size-4" aria-hidden />I have read it. Let's follow the money.
          </button>
        ) : (
          <p className="flex items-center justify-center gap-2 py-3.5 text-sm text-ink-muted">
            <ArrowDown className="size-4 animate-bounce" aria-hidden />
            Read to the end
          </p>
        )}
      </div>
    </div>
  );
}
