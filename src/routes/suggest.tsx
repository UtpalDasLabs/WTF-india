import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, ImagePlus, Info, Lock, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AppShell } from "@/components/wtf/app-shell";
import { useSession } from "@/hooks/use-session";
import { MODERATION_STATE_LABEL, moderateImageMeta, moderateText } from "@/lib/moderation";
import { mySubmissionsQuery, wtfDb, type CandidatePhoto } from "@/lib/queries";
import { SUGGEST_CATEGORIES, formatDate } from "@/lib/wtf";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/suggest")({
  head: () => ({
    meta: [
      { title: "Suggest a government project — We the Future" },
      {
        name: "description",
        content:
          "Tell us about a government project in India that is missing from We the Future, including older work that was officially finished but is in poor condition today.",
      },
      {
        property: "og:title",
        content: "Suggest a government project — We the Future",
      },
      {
        property: "og:description",
        content:
          "Send in a missing government project. Every submission is checked by a reviewer before it is listed publicly.",
      },
    ],
  }),
  component: SuggestPage,
});

const ANONYMOUS_LABEL = "Verified local resident";

function SuggestPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const mine = useQuery(mySubmissionsQuery(session.userId));

  const [name, setName] = useState("");
  const [category, setCategory] = useState(SUGGEST_CATEGORIES[0]!);
  const [locationText, setLocationText] = useState("");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [department, setDepartment] = useState("");
  const [summary, setSummary] = useState("");
  const [condition, setCondition] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [completion, setCompletion] = useState("");
  const [dateNote, setDateNote] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [anonymous, setAnonymous] = useState(false);

  const preview = useMemo(() => {
    const text = [summary, condition].filter(Boolean).join("\n");
    return text.trim() ? moderateText(text) : null;
  }, [summary, condition]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!session.userId) throw new Error("Please sign in first.");
      if (name.trim().length < 5) throw new Error("Please give the project a name.");
      if (locationText.trim().length < 3) throw new Error("Please say where this project is.");
      if (condition.trim().length < 15)
        throw new Error("Please describe what the project looks like today.");

      const summaryCheck = moderateText(summary);
      const conditionCheck = moderateText(condition);
      if (summaryCheck.action === "remove") throw new Error(summaryCheck.reason);
      if (conditionCheck.action === "remove") throw new Error(conditionCheck.reason);

      const worst =
        summaryCheck.action === "hold" || conditionCheck.action === "hold"
          ? "hold"
          : summaryCheck.action === "mask" || conditionCheck.action === "mask"
            ? "mask"
            : "allow";

      const photos: CandidatePhoto[] = [];
      if (imageUrl.trim()) {
        const imageCheck = moderateImageMeta(imageUrl.trim(), caption);
        if (imageCheck.action === "remove") throw new Error(imageCheck.reason);
        photos.push({
          url: imageUrl.trim(),
          caption: caption.trim() || null,
          // Photos never appear unchecked: they start blurred or held.
          moderation_state: imageCheck.action === "hold" ? "held" : "blurred",
          moderation_label: imageCheck.label,
        });
      }

      const citations = sourceUrl.trim()
        ? [
            {
              title: "Link shared by the person who submitted this",
              url: sourceUrl.trim(),
              source_type: "government_portal",
              evidence: "Not checked yet. A reviewer confirms whether this is official.",
            },
          ]
        : [];

      const { error } = await wtfDb.from("candidate_projects").insert({
        origin: "community",
        submitted_by: session.userId,
        submitter_name: session.email?.split("@")[0] ?? "Community member",
        is_anonymous: anonymous,
        review_state: "discovered",
        name: name.trim(),
        plain_summary: summaryCheck.maskedText || null,
        category,
        location_text: locationText.trim(),
        state: state.trim() || null,
        district: district.trim() || null,
        department: department.trim() || null,
        observed_condition: conditionCheck.maskedText,
        completion_date: completion || null,
        approximate_date_note: dateNote.trim() || null,
        citations,
        agent_confidence: 0,
        discovered_from: "Community submission",
        photos,
        moderation_label:
          conditionCheck.action !== "allow" ? conditionCheck.label : summaryCheck.label,
        moderation_state: worst === "hold" ? "held" : "visible",
        moderation_notes: worst === "hold" ? conditionCheck.reason || summaryCheck.reason : null,
      });
      if (error) throw new Error(error.message);
      return worst;
    },
    onSuccess: (worst) => {
      setName("");
      setLocationText("");
      setState("");
      setDistrict("");
      setDepartment("");
      setSummary("");
      setCondition("");
      setSourceUrl("");
      setCompletion("");
      setDateNote("");
      setImageUrl("");
      setCaption("");
      void queryClient.invalidateQueries({ queryKey: ["my-submissions"] });
      void queryClient.invalidateQueries({ queryKey: ["candidates"] });
      toast.success(
        worst === "hold"
          ? "Thanks. Your submission is with a reviewer before anything appears."
          : "Thanks. Your submission is in the reviewer queue.",
        {
          description:
            worst === "mask"
              ? "Strong language was masked with asterisks. Your point stays."
              : undefined,
        },
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell>
      <h1 className="display-lg">Suggest a project</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Know a government project that is missing here? Tell us about it. This includes older work
        that official records closed years ago but that is in poor shape today.
      </p>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-tertiary-container p-4 text-sm text-tertiary-container-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          Anything you send is a community submission, not a verified government fact. It stays out
          of the public list until a reviewer checks it against official records.
        </p>
      </div>

      {session.loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Checking your account…</p>
      ) : !session.userId ? (
        <div className="mt-4 space-y-3 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold">Sign in to send a submission</p>
          <p className="text-sm text-muted-foreground">
            We ask for an account so reviewers can follow up and so the same report cannot be sent
            hundreds of times. You can still choose to appear anonymously in public.
          </p>
          <Button asChild className="w-full rounded-full">
            <Link to="/auth">Continue with Google or email</Link>
          </Button>
        </div>
      ) : (
        <form
          className="mt-4 space-y-3 rounded-xl border border-border bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit.mutate();
          }}
        >
          <div>
            <Label htmlFor="s-name" className="text-sm font-medium">
              Project name
            </Label>
            <Input
              id="s-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={160}
              placeholder="For example: Ghantaghar to Jajmau road widening"
              className="mt-1 rounded-lg bg-surface-container-high"
            />
          </div>

          <div>
            <Label htmlFor="s-category" className="text-sm font-medium">
              Category
            </Label>
            <select
              id="s-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-1 h-11 w-full rounded-lg bg-surface-container-high px-3 text-sm"
            >
              {SUGGEST_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="s-location" className="text-sm font-medium">
              Where is it?
            </Label>
            <Input
              id="s-location"
              value={locationText}
              onChange={(event) => setLocationText(event.target.value)}
              maxLength={200}
              placeholder="Street, area and landmark"
              className="mt-1 rounded-lg bg-surface-container-high"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={district}
              onChange={(event) => setDistrict(event.target.value)}
              maxLength={80}
              placeholder="District or city"
              className="rounded-lg bg-surface-container-high"
              aria-label="District or city"
            />
            <Input
              value={state}
              onChange={(event) => setState(event.target.value)}
              maxLength={80}
              placeholder="State"
              className="rounded-lg bg-surface-container-high"
              aria-label="State"
            />
          </div>

          <Input
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            maxLength={120}
            placeholder="Department or body responsible (optional)"
            className="rounded-lg bg-surface-container-high"
            aria-label="Department"
          />

          <div>
            <Label htmlFor="s-summary" className="text-sm font-medium">
              What was the project meant to do? (optional)
            </Label>
            <Textarea
              id="s-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="In your own words, in plain English"
              className="mt-1 rounded-lg bg-surface-container-high"
            />
          </div>

          <div>
            <Label htmlFor="s-condition" className="text-sm font-medium">
              What does it look like today?
            </Label>
            <Textarea
              id="s-condition"
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Describe what you see now: potholes, standing water, unused rooms, broken lights"
              className="mt-1 rounded-lg bg-surface-container-high"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="s-completion" className="text-xs text-muted-foreground">
                Completion date, if you know it
              </Label>
              <Input
                id="s-completion"
                type="date"
                value={completion}
                onChange={(event) => setCompletion(event.target.value)}
                className="mt-1 rounded-lg bg-surface-container-high"
              />
            </div>
            <div>
              <Label htmlFor="s-datenote" className="text-xs text-muted-foreground">
                Or roughly when
              </Label>
              <Input
                id="s-datenote"
                value={dateNote}
                onChange={(event) => setDateNote(event.target.value)}
                maxLength={120}
                placeholder="Around 2019, before the floods"
                className="mt-1 rounded-lg bg-surface-container-high"
              />
            </div>
          </div>

          <Input
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            maxLength={500}
            placeholder="Official link or notice, if you have one (optional)"
            className="rounded-lg bg-surface-container-high"
            aria-label="Official source link"
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              maxLength={500}
              placeholder="Photo link (optional)"
              className="rounded-lg bg-surface-container-high"
              aria-label="Photo link"
            />
            <Input
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={200}
              placeholder="Photo caption (optional)"
              className="rounded-lg bg-surface-container-high"
              aria-label="Photo caption"
            />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ImagePlus className="size-3.5" aria-hidden />
            Photos stay blurred until the safety check and a reviewer clear them. Please do not
            include number plates, faces of children, or anyone's documents.
          </p>

          <div className="rounded-lg bg-surface-container-high p-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="s-anon" className="text-sm font-medium">
                Post anonymously
              </Label>
              <Switch id="s-anon" checked={anonymous} onCheckedChange={setAnonymous} />
            </div>
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
              {anonymous
                ? `You will show as “${ANONYMOUS_LABEL}”. Your account stays linked privately so reviewers can act on abuse, and is never shown publicly.`
                : `Off by default. Turn this on to appear as “${ANONYMOUS_LABEL}” instead of your name.`}
            </p>
          </div>

          {preview && preview.action !== "allow" ? (
            <div className="rounded-lg bg-tertiary-container p-3 text-xs text-tertiary-container-foreground">
              <p className="font-semibold">
                {preview.action === "mask"
                  ? "Some words will be masked"
                  : preview.action === "hold"
                    ? "This will be held for a reviewer"
                    : "This cannot be sent"}
              </p>
              <p className="mt-1">{preview.reason}</p>
            </div>
          ) : null}

          <Button type="submit" disabled={submit.isPending} className="w-full rounded-full">
            <Send className="mr-1.5 size-4" aria-hidden />
            {submit.isPending ? "Sending…" : "Send to the reviewer queue"}
          </Button>
        </form>
      )}

      {session.userId ? (
        <section className="mt-6">
          <h2 className="display-sm">Your submissions</h2>
          {(mine.data ?? []).length === 0 ? (
            <p className="mt-2 rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
              Nothing yet. Anything you send appears here with its progress.
            </p>
          ) : (
            <ul className="mt-2 space-y-3">
              {(mine.data ?? []).map((item) => (
                <li key={item.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 font-medium",
                        item.review_state === "approved"
                          ? "bg-status-completed-container text-status-completed"
                          : item.review_state === "rejected"
                            ? "bg-destructive-container text-destructive-container-foreground"
                            : "bg-surface-container-highest",
                      )}
                    >
                      {item.review_state === "discovered"
                        ? "Waiting for a reviewer"
                        : item.review_state === "in_review"
                          ? "A reviewer is checking it"
                          : item.review_state === "approved"
                            ? "Listed publicly"
                            : "Not listed"}
                    </span>
                    {item.moderation_state !== "visible" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-highest px-2 py-0.5">
                        <EyeOff className="size-3" aria-hidden />
                        {MODERATION_STATE_LABEL[item.moderation_state]}
                      </span>
                    ) : null}
                    {item.moderation_label && item.moderation_label !== "clean" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-tertiary-container px-2 py-0.5 text-tertiary-container-foreground">
                        <ShieldAlert className="size-3" aria-hidden />
                        {item.moderation_label.replaceAll("_", " ")}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground">
                      Sent {formatDate(item.created_at)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[item.category, item.location_text].filter(Boolean).join(" · ")}
                  </p>
                  {item.observed_condition ? (
                    <p className="mt-2 text-sm text-muted-foreground">{item.observed_condition}</p>
                  ) : null}
                  {item.published_project_id ? (
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: item.published_project_id }}
                      className="mt-2 inline-flex text-sm font-medium text-primary underline underline-offset-4"
                    >
                      See the listed project
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </AppShell>
  );
}
