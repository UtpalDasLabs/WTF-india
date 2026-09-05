# Future Forward India

Build a mobile-first PWA called “We the Future” (WTF) for India. It shows government projects based on a user’s location, with map/list discovery, search, and filters for Planned, Ongoing, Delayed, Completed, and Finished Early. Make Material 3 the design language. Create a realistic testable MVP with seeded example Indian projects and an evidence panel on every project that shows official source links, source type, verification status, confidence, last verified date, and extracted evidence. Write project details in clear plain English. Design a strict separation between verified project facts/timeline and community ratings, reviews, feedback, and user images. Use Supabase for data, authentication-ready user content, and an internal AI research-agent workflow concept that discovers candidate projects from official data sources, retains citations, and sends them through a reviewer verification queue before publishing as verified. Add basic common public-platform AI moderation for review text and uploaded images. Mask profanity or flagged words with asterisks where appropriate rather than silently hiding it; provide moderation labels and enforce hold/blur/remove for unsafe content according to severity. Include a reviewer/admin verification workflow in the UI with clear statuses. Make this polished enough to test, responsive, and include a guided empty/loading/permission-denied state for location. Do not implement Android packaging yet.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm ci
npm run dev
```

Data and auth are backed by Supabase; the publishable keys live in `.env`. The
reviewer research agent additionally needs `AI_GATEWAY_URL`, `AI_GATEWAY_API_KEY`
and `AI_MODEL` pointing at any OpenAI-compatible chat-completions endpoint.

## Deploy to GitHub Pages

The app normally runs as a TanStack Start SSR app (`npm run build`, served by nitro). GitHub Pages serves static files
only, so the Pages build swaps SSR for TanStack Start's SPA mode: one prerendered
shell (`index.html`) that boots the client router, with all data still fetched from
Supabase directly in the browser.

Build it locally:

```sh
npm run build:pages                # output in dist/client
BASE_PATH=/ npm run build:pages    # for a custom domain or a <user>.github.io repo
```

The base path defaults to `/<repo>/` (derived from `GITHUB_REPOSITORY`), which is
where a GitHub Pages project site is served from. Set `BASE_PATH` yourself when that
is not the case.

### Publishing

1. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main`, or run the workflow manually from any branch via
   **Actions → Deploy to GitHub Pages → Run workflow**.

The workflow builds the site and publishes `dist/client`. Supabase credentials come
from the committed `.env` — they are publishable (anon) keys, meant for a browser
bundle; row-level security in Supabase is what protects the data.

### What differs on Pages

Everything works except the reviewer **research agent**, which is a server function
that calls an AI gateway with a secret key. A static host cannot run it, so the admin
page shows a short note in its place. Reviewing, approving and publishing candidates
are unaffected.
