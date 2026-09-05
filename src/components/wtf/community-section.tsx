import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EyeOff, ImagePlus, MessageSquare, ShieldAlert, Star } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import {
  reviewImagesQuery,
  reviewsQuery,
  wtfDb,
  type Review,
  type ReviewImage,
} from "@/lib/queries";
import { MODERATION_STATE_LABEL, moderateImageMeta, moderateText } from "@/lib/moderation";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/wtf";

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex", className)} aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((index) => (
        <Star
          key={index}
          className={cn(
            "size-4",
            index <= value ? "fill-current text-tertiary" : "text-muted-foreground/40",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}

function ReviewImageTile({ image }: { image: ReviewImage }) {
  const [revealed, setRevealed] = useState(false);
  const blurred = image.moderation_state === "blurred" && !revealed;

  return (
    <figure className="overflow-hidden rounded-2xl bg-surface-container-highest">
      <div className="relative">
        <img
          src={image.image_url}
          alt={image.caption ?? "Photo shared by a community member"}
          loading="lazy"
          className={cn("h-32 w-full object-cover", blurred && "blur-md")}
        />
        {blurred ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="absolute inset-0 grid place-items-center bg-background/45 text-xs font-semibold"
          >
            <span className="rounded-full bg-surface-container px-3 py-1">
              Blurred pending check — tap to view
            </span>
          </button>
        ) : null}
      </div>
      {image.caption ? (
        <figcaption className="p-2 text-xs text-muted-foreground">{image.caption}</figcaption>
      ) : null}
    </figure>
  );
}

export function CommunitySection({ projectId }: { projectId: string }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const reviews = useQuery(reviewsQuery(projectId));
  const images = useQuery(reviewImagesQuery(projectId));

  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [caption, setCaption] = useState("");

  const preview = useMemo(() => (body.trim() ? moderateText(body) : null), [body]);

  const visible = (reviews.data ?? []).filter(
    (review) => review.moderation_state === "visible",
  );
  const mine = (reviews.data ?? []).filter(
    (review) => review.user_id && review.user_id === session.userId,
  );
  const average =
    visible.length > 0
      ? visible.reduce((sum, review) => sum + review.rating, 0) / visible.length
      : null;

  const submit = useMutation({
    mutationFn: async () => {
      if (!session.userId) throw new Error("Please sign in first.");
      if (rating < 1) throw new Error("Please choose a star rating.");

      const check = moderateText(body);
      if (check.action === "remove") throw new Error(check.reason);

      const moderationState =
        check.action === "hold" ? "held" : ("visible" as const);

      const { data, error } = await wtfDb
        .from("reviews")
        .insert({
          project_id: projectId,
          user_id: session.userId,
          author_name: session.email?.split("@")[0] ?? "Community member",
          rating,
          body,
          masked_body: check.maskedText,
          moderation_label: check.label,
          moderation_state: moderationState,
          moderation_notes: check.reason,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      if (imageUrl.trim()) {
        const imageCheck = moderateImageMeta(imageUrl.trim(), caption);
        if (imageCheck.action !== "remove") {
          const { error: imageError } = await wtfDb.from("review_images").insert({
            review_id: (data as { id: string }).id,
            user_id: session.userId,
            image_url: imageUrl.trim(),
            caption: caption || null,
            moderation_label: imageCheck.label,
            moderation_state:
              imageCheck.action === "allow"
                ? "blurred"
                : imageCheck.action === "hold"
                  ? "held"
                  : "blurred",
          });
          if (imageError) throw new Error(imageError.message);
        }
      }

      return check;
    },
    onSuccess: (check) => {
      setRating(0);
      setBody("");
      setImageUrl("");
      setCaption("");
      void queryClient.invalidateQueries({ queryKey: ["reviews", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["review-images", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["ratings"] });
      toast.success(
        check.action === "hold"
          ? "Thanks. A reviewer will check this before it appears publicly."
          : "Thanks, your review is published.",
        { description: check.action === "mask" ? check.reason : undefined },
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const imagesByReview = (images.data ?? []).reduce<Record<string, ReviewImage[]>>(
    (acc, image) => {
      (acc[image.review_id] ??= []).push(image);
      return acc;
    },
    {},
  );

  const renderReview = (review: Review, isMine = false) => (
    <li key={review.id} className="rounded-2xl bg-surface-container p-4">
      <div className="flex items-center justify-between gap-2">
        <Stars value={review.rating} />
        <span className="text-xs text-muted-foreground">{formatDate(review.created_at)}</span>
      </div>
      <p className="mt-2 text-sm">{review.masked_body ?? review.body}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium">{review.author_name ?? "Community member"}</span>
        {review.moderation_label && review.moderation_label !== "clean" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-tertiary-container px-2 py-0.5 text-tertiary-container-foreground">
            <ShieldAlert className="size-3" aria-hidden />
            {review.moderation_label.replaceAll("_", " ")}
          </span>
        ) : null}
        {isMine && review.moderation_state !== "visible" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-highest px-2 py-0.5">
            <EyeOff className="size-3" aria-hidden />
            {MODERATION_STATE_LABEL[review.moderation_state]}
          </span>
        ) : null}
      </div>
      {(imagesByReview[review.id] ?? []).length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {imagesByReview[review.id]!
            .filter((image) => image.moderation_state !== "removed")
            .map((image) => (
              <ReviewImageTile key={image.id} image={image} />
            ))}
        </div>
      ) : null}
    </li>
  );

  return (
    <section
      aria-labelledby="community-heading"
      className="rounded-3xl border border-dashed border-outline bg-surface p-4"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tertiary-container text-tertiary-container-foreground">
          <MessageSquare className="size-4.5" aria-hidden />
        </span>
        <div>
          <h2 id="community-heading" className="text-base font-semibold">
            What people say
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Opinions, ratings and photos from the public. These are not checked facts
            and never change the official record above.
          </p>
        </div>
      </div>

      {average != null ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface-container-high p-3">
          <span className="text-2xl font-semibold">{average.toFixed(1)}</span>
          <div>
            <Stars value={Math.round(average)} />
            <p className="text-xs text-muted-foreground">
              {visible.length} {visible.length === 1 ? "review" : "reviews"} from the
              public
            </p>
          </div>
        </div>
      ) : null}

      <ul className="mt-4 space-y-3">
        {visible.map((review) => renderReview(review))}
        {visible.length === 0 ? (
          <li className="rounded-2xl bg-surface-container p-4 text-sm text-muted-foreground">
            No public reviews yet. Be the first to say what this project is like on the
            ground.
          </li>
        ) : null}
      </ul>

      {mine.some((review) => review.moderation_state !== "visible") ? (
        <div className="mt-4">
          <h3 className="label-sm text-muted-foreground">Your posts being checked</h3>
          <ul className="mt-2 space-y-3">
            {mine
              .filter((review) => review.moderation_state !== "visible")
              .map((review) => renderReview(review, true))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl bg-surface-container p-4">
        <h3 className="text-sm font-semibold">Add your review</h3>
        {session.userId ? (
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              submit.mutate();
            }}
          >
            <div>
              <span className="text-xs text-muted-foreground">Your rating</span>
              <div className="mt-1 flex gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    aria-label={`${value} star${value > 1 ? "s" : ""}`}
                    className="m3-state rounded-full p-1"
                  >
                    <Star
                      className={cn(
                        "size-6",
                        value <= rating
                          ? "fill-current text-tertiary"
                          : "text-muted-foreground/40",
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>

            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What is this project like where you live?"
              rows={4}
              maxLength={1000}
              className="rounded-2xl bg-surface-container-high"
            />

            {preview && preview.action !== "allow" ? (
              <div className="rounded-2xl bg-tertiary-container p-3 text-xs text-tertiary-container-foreground">
                <p className="font-semibold">
                  {preview.action === "mask"
                    ? "Some words will be masked"
                    : preview.action === "hold"
                      ? "This will be held for a reviewer"
                      : "This cannot be published"}
                </p>
                <p className="mt-1">{preview.reason}</p>
                {preview.action === "mask" ? (
                  <p className="mt-2 rounded-xl bg-surface-container p-2 text-foreground">
                    {preview.maskedText}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="Photo link (optional)"
                className="rounded-2xl bg-surface-container-high"
              />
              <Input
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="Photo caption (optional)"
                className="rounded-2xl bg-surface-container-high"
              />
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ImagePlus className="size-3.5" aria-hidden />
              Photos start blurred until the safety check and a reviewer clear them.
            </p>

            <Button
              type="submit"
              disabled={submit.isPending}
              className="w-full rounded-full"
            >
              {submit.isPending ? "Sending…" : "Post review"}
            </Button>
          </form>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-muted-foreground">
              Sign in to rate this project, write a review or share a photo.
            </p>
            <Button asChild className="rounded-full">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
