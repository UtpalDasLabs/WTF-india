import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, ImageIcon, Loader2, MapPin, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deviceId } from "@/hooks/use-device-id";
import { readPhotoMeta, stripAndResize } from "@/lib/photo";
import {
  createCommunitySpot,
  createPost,
  projectsQuery,
  uploadPhoto,
  type Project,
} from "@/lib/queries";
import { distanceKm, nearestCity } from "@/lib/wtf";
import { cn } from "@/lib/utils";

/**
 * Take a photograph, and the app works out what it is a photograph of.
 *
 * This is the action the whole product is built around. Reporting normally
 * means knowing a project's name, its department and its sanction number — which
 * is exactly the barrier that leaves civic apps empty. A photograph already
 * knows where it was taken, so the only thing asked of somebody standing in
 * front of a half-built flyover is to point their phone at it.
 *
 * What happens after that is deliberately conservative. The location decides
 * which tracked project it belongs to, and if none is close enough it becomes a
 * new spot that is marked, everywhere it appears, as something a reader added
 * and nobody has checked.
 */

/** Inside this, the photograph is almost certainly of that project. */
const SURE_KM = 0.6;
/** Beyond this, we stop guessing and offer to start a new spot instead. */
const MAYBE_KM = 2.5;

const WARNED_KEY = "wtf.warned";
const MINE_KEY = "wtf.myposts";

/** Shared with the thread, so a photo can be deleted the moment it is posted. */
function rememberMyPost(id: string) {
  try {
    const raw = window.localStorage.getItem(MINE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const list = Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : [];
    if (!list.includes(id)) {
      window.localStorage.setItem(MINE_KEY, JSON.stringify([...list, id].slice(-500)));
    }
  } catch {
    // Storage blocked. The server still knows who wrote it.
  }
}

type Stage =
  | { step: "warn" }
  | { step: "reading" }
  | { step: "failed"; message: string }
  | {
      step: "compose";
      photo: Blob;
      preview: string;
      lat: number | null;
      lng: number | null;
      takenAt: string | null;
    }
  | { step: "sending" };

function hasWarned(): boolean {
  try {
    return window.localStorage.getItem(WARNED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Browser location, used only when the photograph itself does not carry a fix. */
function askWhereWeAre(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

function Warning({
  onCamera,
  onLibrary,
  onCancel,
}: {
  onCamera: () => void;
  onLibrary: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="px-5 pb-8 pt-2">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-status-delayed/15">
        <ShieldAlert className="size-6 text-status-delayed" aria-hidden />
      </div>
      <h2 className="display-sm mt-4 text-center text-balance">
        Photograph the work, not the people
      </h2>
      <ul className="mx-auto mt-5 max-w-sm space-y-3 text-sm leading-relaxed text-muted-foreground">
        <li className="flex gap-3">
          <span aria-hidden className="text-foreground">
            1
          </span>
          Keep faces, number plates and house numbers out of the frame. Somebody who happens to live
          next to a stalled project did not volunteer for this.
        </li>
        <li className="flex gap-3">
          <span aria-hidden className="text-foreground">
            2
          </span>
          Never photograph anywhere it is not safe or not allowed to stand. No photograph is worth
          an argument with a site guard.
        </li>
        <li className="flex gap-3">
          <span aria-hidden className="text-foreground">
            3
          </span>
          We read where the photo was taken to find the project, then strip that out of the file
          before it is uploaded. Nobody downloading it can see your location.
        </li>
      </ul>
      <div className="mt-7 flex flex-col gap-2">
        <button
          type="button"
          onClick={onCamera}
          className="m3-state flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background hover:opacity-90"
        >
          <Camera className="size-4" aria-hidden />
          Got it — open the camera
        </button>
        <button
          type="button"
          onClick={onLibrary}
          className="m3-state flex w-full items-center justify-center gap-2 rounded-full border border-outline-variant px-5 py-3 text-sm font-semibold hover:bg-surface-container-high"
        >
          <ImageIcon className="size-4" aria-hidden />
          Pick one I already took
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="m3-state w-full rounded-full px-5 py-3 text-sm font-medium text-muted-foreground hover:bg-surface-container-high"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

export function Capture({
  open,
  onOpenChange,
  /** When the camera is opened from inside a project, that project wins over the guess. */
  projectId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string | null;
}) {
  const queryClient = useQueryClient();
  const projects = useQuery(projectsQuery());
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const libraryRef = useRef<HTMLInputElement | null>(null);
  const [stage, setStage] = useState<Stage>(() => ({ step: "warn" }));
  const [caption, setCaption] = useState("");
  const [newName, setNewName] = useState("");
  const [startNew, setStartNew] = useState(false);

  const reset = useCallback(() => {
    setStage({ step: "warn" });
    setCaption("");
    setNewName("");
    setStartNew(false);
  }, []);

  const close = useCallback(
    (next: boolean) => {
      if (!next) {
        if (stage.step === "compose") URL.revokeObjectURL(stage.preview);
        reset();
      }
      onOpenChange(next);
    },
    [onOpenChange, reset, stage],
  );

  const pick = useCallback((source: "camera" | "library") => {
    try {
      window.localStorage.setItem(WARNED_KEY, "1");
    } catch {
      // A browser that will not remember the warning simply shows it again.
    }
    (source === "camera" ? cameraRef : libraryRef).current?.click();
  }, []);

  // Somebody who has read the warning once should not have to read it again to
  // get to the camera: opening the sheet opens the camera.
  useEffect(() => {
    if (open && stage.step === "warn" && hasWarned()) pick("camera");
  }, [open, stage.step, pick]);

  const onFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Let the same photo be picked twice in a row.
    event.target.value = "";
    if (!file) {
      setStage({ step: "warn" });
      return;
    }
    setStage({ step: "reading" });
    try {
      const meta = await readPhotoMeta(file);
      const photo = await stripAndResize(file, meta.orientation);
      // A photo with the location switched off is still worth having; we just
      // have to ask the phone where it is instead of asking the file.
      const fix =
        meta.lat != null && meta.lng != null
          ? { lat: meta.lat, lng: meta.lng }
          : await askWhereWeAre();
      setStage({
        step: "compose",
        photo,
        preview: URL.createObjectURL(photo),
        lat: fix?.lat ?? null,
        lng: fix?.lng ?? null,
        takenAt: meta.takenAt,
      });
    } catch (error) {
      setStage({
        step: "failed",
        message: error instanceof Error ? error.message : "That photo could not be read.",
      });
    }
  }, []);

  // What the photograph is probably of.
  const match = useMemo(() => {
    if (stage.step !== "compose") return null;
    const all = (projects.data ?? []).filter((project) => project.published);
    if (projectId) {
      const pinned = all.find((project) => project.id === projectId);
      if (pinned) return { project: pinned, distance: null as number | null };
    }
    if (stage.lat == null || stage.lng == null) return null;

    let best: { project: Project; distance: number } | null = null;
    for (const project of all) {
      if (project.latitude == null || project.longitude == null) continue;
      const distance = distanceKm(stage.lat, stage.lng, project.latitude, project.longitude);
      if (!best || distance < best.distance) best = { project, distance };
    }
    return best && best.distance <= MAYBE_KM ? best : null;
  }, [projects.data, projectId, stage]);

  const needsName = stage.step === "compose" && (startNew || !match);
  const canSend =
    stage.step === "compose" &&
    (!needsName || (newName.trim().length >= 4 && stage.lat != null && stage.lng != null));

  const send = useCallback(async () => {
    if (stage.step !== "compose") return;
    const device = deviceId();
    if (!device) return;

    setStage({ step: "sending" });
    try {
      let target = match?.project.id ?? null;
      if (needsName) {
        if (stage.lat == null || stage.lng == null)
          throw new Error("We could not tell where this photo was taken.");
        const city = nearestCity(stage.lat, stage.lng);
        target = await createCommunitySpot({
          device,
          name: newName.trim(),
          summary: caption.trim() || null,
          lat: stage.lat,
          lng: stage.lng,
          district: city?.name ?? null,
          state: city?.state ?? null,
        });
      }
      if (!target) throw new Error("We could not work out which project this belongs to.");

      const path = await uploadPhoto(target, stage.photo);
      const postId = await createPost({
        projectId: target,
        kind: "photo",
        device,
        body: caption.trim() || null,
        photoPath: path,
        lat: stage.lat,
        lng: stage.lng,
        takenAt: stage.takenAt,
      });

      // A photograph is a post like any other, and it was never being written
      // to the list the delete button reads — so the one thing somebody is
      // most likely to want to take back was the one thing they could not.
      // The server list is the real answer; this is the head start.
      rememberMyPost(postId);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["posts", target] }),
        queryClient.invalidateQueries({ queryKey: ["post-counts"] }),
        queryClient.invalidateQueries({ queryKey: ["recent-posts"] }),
        queryClient.invalidateQueries({ queryKey: ["my-post-ids"] }),
        needsName ? queryClient.invalidateQueries({ queryKey: ["projects"] }) : null,
      ]);

      URL.revokeObjectURL(stage.preview);
      toast.success(
        needsName ? "Added. Everybody can see it now." : "Posted. Thanks for going and looking.",
      );
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not send.");
      // Back to the composer with the photograph and caption intact, rather than
      // making somebody who is standing in the street take it again.
      setStage(stage);
    }
  }, [caption, match, needsName, newName, onOpenChange, queryClient, reset, stage]);

  if (!open) return null;

  return (
    <>
      {/* Two inputs rather than one: `capture` opens the rear camera straight
          away on a phone, but it also takes the photo library away, and a photo
          somebody took yesterday is worth just as much. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />

      <Drawer open={open} onOpenChange={close}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerTitle className="sr-only">Add a photo</DrawerTitle>

          {stage.step === "warn" ? (
            <Warning
              onCamera={() => pick("camera")}
              onLibrary={() => pick("library")}
              onCancel={() => close(false)}
            />
          ) : stage.step === "reading" ? (
            <div className="grid place-items-center gap-3 px-5 py-16 text-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Reading the photo and working out where it was taken…
              </p>
              <button
                type="button"
                onClick={() => setStage({ step: "warn" })}
                className="text-xs font-medium underline underline-offset-2"
              >
                Pick a different photo
              </button>
            </div>
          ) : stage.step === "failed" ? (
            <div className="px-5 pb-8 pt-6 text-center">
              <p className="display-sm text-balance">That photo could not be read</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                {stage.message}
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => pick("library")}
                  className="m3-state w-full rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background hover:opacity-90"
                >
                  Try a different photo
                </button>
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="m3-state w-full rounded-full px-5 py-3 text-sm font-medium text-muted-foreground hover:bg-surface-container-high"
                >
                  Not now
                </button>
              </div>
            </div>
          ) : stage.step === "sending" ? (
            <div className="grid place-items-center gap-3 px-5 py-16 text-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">Sending…</p>
            </div>
          ) : (
            <div className="overflow-y-auto px-5 pb-8 pt-2">
              <div className="overflow-hidden rounded-2xl bg-surface-container-highest">
                <img
                  src={stage.preview}
                  alt="The photo you are about to post"
                  className="max-h-64 w-full object-cover"
                />
              </div>

              <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
                {match && !startNew ? (
                  <>
                    <p className="eyebrow text-muted-foreground">
                      {match.distance == null
                        ? "Posting to"
                        : match.distance <= SURE_KM
                          ? "This looks like"
                          : "The nearest thing we track"}
                    </p>
                    <p className="mt-1.5 font-semibold leading-snug">{match.project.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {match.distance == null
                        ? "You opened the camera from this project."
                        : `${match.distance < 1 ? `${Math.round(match.distance * 1000)} m` : `${match.distance.toFixed(1)} km`} from where the photo was taken`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setStartNew(true)}
                      className="mt-3 text-xs font-semibold underline underline-offset-2"
                    >
                      It's something else
                    </button>
                  </>
                ) : (
                  <>
                    <p className="eyebrow text-muted-foreground">
                      {match ? "Starting something new" : "Nothing tracked near here"}
                    </p>
                    <label className="mt-2 block text-sm">
                      <span className="text-muted-foreground">What is it?</span>
                      <Input
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                        placeholder="Half-built footbridge at Sector 12"
                        className="mt-1.5"
                        maxLength={120}
                      />
                    </label>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      This will appear for everybody, marked as added by a reader and not checked
                      against any official record. No budget or dates are claimed for it.
                    </p>
                    {match ? (
                      <button
                        type="button"
                        onClick={() => setStartNew(false)}
                        className="mt-3 text-xs font-semibold underline underline-offset-2"
                      >
                        Actually, it's {match.project.name}
                      </button>
                    ) : null}
                  </>
                )}

                {stage.lat == null ? (
                  <p className="mt-3 flex items-start gap-2 rounded-xl bg-status-delayed/10 p-2.5 text-xs leading-relaxed text-status-delayed">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    This photo carries no location, and the phone would not give one either. Open it
                    from a project's own page to post it there.
                  </p>
                ) : null}
              </div>

              <Textarea
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="What are we looking at? When did you last see work here?"
                className="mt-4 min-h-24"
                maxLength={2000}
              />

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="m3-state grid size-12 shrink-0 place-items-center rounded-full border border-outline-variant hover:bg-surface-container-high"
                  aria-label="Cancel"
                >
                  <X className="size-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={send}
                  disabled={!canSend}
                  className={cn(
                    "m3-state flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold",
                    canSend
                      ? "bg-foreground text-background hover:opacity-90"
                      : "cursor-not-allowed bg-surface-container-high text-muted-foreground",
                  )}
                >
                  <Check className="size-4" aria-hidden />
                  Post it
                </button>
              </div>

              <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
                The location was stripped out of the file. It goes up straight away, and anyone can
                flag it or add a note to it.
              </p>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}

/**
 * The round camera button.
 *
 * Deliberately just a button: the sheet it opens is mounted once by the shell,
 * because the masthead and the tab bar both carry one of these and two mounted
 * sheets means two hidden file inputs fighting over the same photograph.
 */
