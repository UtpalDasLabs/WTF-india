import { lazy, Suspense, type ComponentProps } from "react";

const Sheet = lazy(() =>
  import("@/components/wtf/posts-sheet").then((module) => ({ default: module.PostsSheet })),
);

/**
 * The replies sheet, fetched when it is first opened.
 *
 * Same reasoning as capture-lazy: it carries the drawer, and the drawer is
 * 55KB that nobody scrolling the feed has asked for. The feed renders this only
 * when a card's comment button has been pressed, so the import happens then.
 */
export function PostsSheet(props: ComponentProps<typeof Sheet>) {
  return (
    <Suspense fallback={null}>
      <Sheet {...props} />
    </Suspense>
  );
}
