import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

/**
 * Where Supabase sends the system browser once Google has signed the user in on
 * Android. It is a custom scheme, not a URL — the WebView is served from a local
 * origin, so there is no real https address to come back to.
 *
 * Three places have to agree on this string:
 *  - android/app/src/main/AndroidManifest.xml (the BROWSABLE <intent-filter>, via
 *    @string/custom_url_scheme, which Capacitor sets to the appId)
 *  - Supabase dashboard → Authentication → URL Configuration → Redirect URLs
 *  - the signInWithOAuth call in src/routes/auth.tsx
 */
const NATIVE_SCHEME = "in.wethefuture.wtf";
export const NATIVE_OAUTH_REDIRECT = `${NATIVE_SCHEME}://auth/callback`;

/**
 * Finishes the native Google sign-in started in src/routes/auth.tsx.
 *
 * Google refuses OAuth inside an embedded WebView, so on Android the consent screen
 * is opened in a Chrome Custom Tab. Android hands the redirect back to the app as an
 * `appUrlOpen` event; this hook trades the PKCE `code` in it for a session and closes
 * the tab. On web it does nothing — there the browser redirect completes on its own.
 */
export function useOAuthDeepLink() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    let remove: (() => void) | undefined;

    const handle = async (url: string) => {
      if (!url.startsWith(`${NATIVE_SCHEME}://`)) return;

      let params: URLSearchParams;
      try {
        params = new URL(url).searchParams;
      } catch {
        return;
      }

      const code = params.get("code");
      const failure = params.get("error_description") ?? params.get("error");
      if (!code && !failure) return;

      // The Custom Tab sits on top of the app until it is dismissed.
      await Browser.close().catch(() => undefined);

      if (!code) {
        toast.error("Google sign-in was cancelled.");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        toast.error("Google sign-in did not work. Please try email instead.");
        return;
      }
      toast.success("Signed in with Google.");
    };

    void App.addListener("appUrlOpen", (event) => {
      void handle(event.url);
    }).then((listener) => {
      if (cancelled) {
        void listener.remove();
      } else {
        remove = () => void listener.remove();
      }
    });

    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);
}
