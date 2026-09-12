import { lazy, Suspense, type ComponentProps } from "react";

const CaptureSheet = lazy(() =>
  import("@/components/wtf/capture").then((module) => ({ default: module.Capture })),
);

/**
 * The report sheet, fetched when it is first opened rather than at startup.
 *
 * It pulls in a drawer, a form, the EXIF reader and the canvas resizer — none
 * of which a reader needs to see the feed, and all of which used to be in the
 * chunk that has to arrive before the first frame.
 *
 * Nothing is mounted until `open` goes true for the first time, so the fetch
 * happens on the tap; after that it stays mounted and closes instantly, because
 * a sheet that re-fetches every time you dismiss it is worse than one that
 * costs a moment once.
 */
export function Capture(props: ComponentProps<typeof CaptureSheet>) {
  return (
    <Suspense fallback={null}>
      <CaptureSheet {...props} />
    </Suspense>
  );
}
