import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "in.wethefuture.wtf",
  appName: "We the Future",
  // Both native builds reuse the static SPA bundle, so build it with BASE_PATH=/
  // (see npm run build:android and npm run build:ios) — inside the web view the
  // app is served from the root.
  webDir: "dist/client",
  android: {
    // Supabase is HTTPS-only; refusing cleartext keeps an http:// endpoint from
    // being introduced by accident.
    allowMixedContent: false,
    // Matches --background in src/styles.css and wtfBackground in the Android
    // theme, so there is no white frame between the WebView and the window
    // behind it while a page is still painting.
    backgroundColor: "#101219",
  },
  ios: {
    // The same ground colour, for the same reason: this is what sits behind
    // CAPBridgeViewController, and LaunchScreen.storyboard carries it for the
    // frame before that. App Transport Security already refuses cleartext by
    // default, so iOS needs no equivalent of allowMixedContent.
    backgroundColor: "#101219",
    // The layout is full-bleed — a 100dvh feed under viewport-fit=cover — and
    // it reads the notch and the home indicator itself through
    // env(safe-area-inset-*). Left on "automatic", WKWebView insets the scroll
    // view as well and everything is padded twice.
    contentInset: "never",
    // Long-pressing a link otherwise opens a peek preview, which on a page
    // whose main gesture is a vertical swipe fires on the way past.
    allowsLinkPreview: false,
  },
};

export default config;
