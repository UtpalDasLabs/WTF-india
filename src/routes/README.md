# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
defines a route. Do **not** create `src/pages/`, `src/routes/_app/index.tsx`, or
`app/layout.tsx` — those are Next.js / Remix conventions. The only root layout
is `src/routes/__root.tsx`.

## Conventions

| File | URL |
| --- | --- |
| `index.tsx` | `/` |
| `about.tsx` | `/about` |
| `users/index.tsx` | `/users` |
| `users/$id.tsx` | `/users/:id` (dynamic — bare `$`, no curly braces) |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment) |
| `files/$.tsx` | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx` | layout route (renders children via `<Outlet />`) |
| `__root.tsx` | app shell — wraps every page; preserve `<Outlet />` |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.

## What lives where in this app

| Route | What it is |
| --- | --- |
| `index.tsx` | The feed. Full-screen cards, one project each, ranked by `lib/hot.ts`. First visit runs the radar and then scopes the feed to your city. |
| `discover.tsx` | The map. Aerial imagery past a city-level zoom, a rail of what is on screen, then the filtered list. |
| `news.tsx` | Headlines about public money, scoped to the device, with the Constitution linked from it. |
| `trending.tsx` | A redirect to `/`. Trending used to be its own page and those links have been shared. |
| `projects.$projectId.tsx` | One project: the official record, then the reader thread under it. |
| `suggest.tsx` | Proposing a project with citations, for the reviewer queue. No tab of its own — the camera is the way to report something; this is linked from the places where a form is the right answer. |
| `admin.tsx` | The reviewer desk, including flagged posts and photos. |
| `constitution.tsx` | The Constitution of India, in the languages an official text exists for. |
| `auth.tsx` | Sign-in. Only reviewers and star ratings need it — posting does not. |
