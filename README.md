# Future Forward India

Build a mobile-first PWA called “We the Future” (WTF) for India. It shows government projects based on a user’s location, with map/list discovery, search, and filters for Planned, Ongoing, Delayed, Completed, and Finished Early. Make Material 3 the design language. Create a realistic testable MVP with seeded example Indian projects and an evidence panel on every project that shows official source links, source type, verification status, confidence, last verified date, and extracted evidence. Write project details in clear plain English. Design a strict separation between verified project facts/timeline and community ratings, reviews, feedback, and user images. Use Supabase for data, authentication-ready user content, and an internal AI research-agent workflow concept that discovers candidate projects from official data sources, retains citations, and sends them through a reviewer verification queue before publishing as verified. Add basic common public-platform AI moderation for review text and uploaded images. Mask profanity or flagged words with asterisks where appropriate rather than silently hiding it; provide moderation labels and enforce hold/blur/remove for unsafe content according to severity. Include a reviewer/admin verification workflow in the UI with clear statuses. Make this polished enough to test, responsive, and include a guided empty/loading/permission-denied state for location. Do not implement Android packaging yet.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
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
   This matters, and it is the one step that cannot be automated: a site left on
   _Deploy from a branch_ serves Jekyll's render of the repo — you get `README.md` as
   the home page — and ignores this workflow's output, while the deploy still reports
   success. Changing the source needs repo-admin rights, which a workflow's
   `GITHUB_TOKEN` never has, so it has to be set once by hand.
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

## Android APK

The Android app is the same web bundle wrapped in a Capacitor WebView — one codebase,
no second implementation. The only difference from the Pages build is that it is rooted
at `/` instead of `/<repo>/`, because inside the WebView the app is served from the root.

### Getting an APK

Every push to `main` runs the **Build Android APK** workflow, which uploads
`we-the-future-debug-<sha>.apk` as a build artifact. Download it from the run's page
under **Artifacts**, then install it on a device with USB debugging or by copying the
file over and allowing installation from unknown sources.

You can also trigger it by hand: **Actions → Build Android APK → Run workflow**.

### Building locally

Needs a JDK 21 and the Android SDK (`ANDROID_HOME` set):

```sh
npm run build:android          # builds the web bundle and syncs it into android/
cd android && ./gradlew assembleDebug
# app/build/outputs/apk/debug/app-debug.apk
```

`npm run build:android` must be re-run after any web change — the native project reads
the bundle from `android/app/src/main/assets/`, which is gitignored and regenerated.

### Signing a release build

The workflow only produces a debug APK unless signing secrets are present, since an
unsigned release APK cannot be installed. To get a signed release, add these repository
secrets and the workflow picks them up automatically:

| Secret                      | What it holds                        |
| --------------------------- | ------------------------------------ |
| `ANDROID_KEYSTORE_BASE64`   | your `.jks` keystore, base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password                |
| `ANDROID_KEY_ALIAS`         | the key alias inside the keystore    |
| `ANDROID_KEY_PASSWORD`      | the password for that key            |

### Google sign-in

Sign-in uses Supabase's own OAuth, and the two platforms take different routes:

- **Web** redirects in place, back to the deployed origin.
- **Android** cannot use the in-app WebView (Google refuses OAuth there), so it opens a
  Chrome Custom Tab and comes back through the deep link
  `in.wethefuture.wtf://auth/callback`, registered as an intent filter in the manifest.

Both need setup in the Supabase dashboard:

1. **Auth → URL Configuration → Redirect URLs**: add `in.wethefuture.wtf://auth/callback`
   alongside the existing web origin.
2. **Auth → Providers → Google**: enable it with a Google Cloud _Web application_ OAuth
   client. No Android client is needed — Google only ever sees Supabase's own callback.

The client uses the PKCE flow, which both paths require.

### Known limits on Android

The reviewer research agent is hidden, exactly as on Pages — it is a server function and
the APK ships no server.

## Design

Type is Newsreader (editorial headings) over Inter (interface and figures), both
self-hosted from `public/fonts` so the APK renders correctly with no network and the
first paint never waits on a third party. Colour, spacing, radius and elevation are
semantic tokens in `src/styles.css`; components should reach for those rather than raw
values.

The map is Leaflet over OpenStreetMap raster tiles. OSM requires visible attribution —
the map keeps its attribution control, so do not remove it. Note that OSM's public tile
servers are a volunteer resource with a
[usage policy](https://operations.osmfoundation.org/policies/tiles/); heavy traffic
should move to a commercial tile host.
