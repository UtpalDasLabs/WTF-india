import { useState } from "react";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppShell } from "@/components/wtf/app-shell";
import { NATIVE_OAUTH_REDIRECT } from "@/hooks/use-oauth-deeplink";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { appOrigin } from "@/lib/base-path";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — We the Future" },
      {
        name: "description",
        content:
          "Sign in to rate government projects, write reviews and share photos on We the Future.",
      },
      { property: "og:title", content: "Sign in — We the Future" },
      {
        property: "og:description",
        content: "Create an account to add your voice to government project reviews in India.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: appOrigin() },
        });
        if (error) throw error;
        toast.success("Account created. You are signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back.");
      }
      void navigate({ to: "/" });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      if (Capacitor.isNativePlatform()) {
        // Google blocks OAuth inside embedded WebViews, and the WebView's origin is a
        // local one Supabase can never redirect back to. So ask Supabase for the URL
        // instead of following it, open that in a Chrome Custom Tab, and let
        // useOAuthDeepLink (mounted in __root) redeem the code the deep link returns.
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: NATIVE_OAUTH_REDIRECT, skipBrowserRedirect: true },
        });
        if (error) throw error;
        if (!data.url) throw new Error("Supabase returned no sign-in URL.");
        await Browser.open({ url: data.url });
        setBusy(false);
        return;
      }

      // Web: Supabase redirects the browser to Google and back to redirectTo, so on
      // success this call navigates away and nothing after it runs.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: appOrigin() },
      });
      if (error) throw error;
    } catch {
      setBusy(false);
      toast.error("Google sign-in did not work. Please try email instead.");
    }
  };

  if (session.userId) {
    return (
      <AppShell>
        <div className="space-y-4">
          <h1 className="display-lg">Your account</h1>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-muted-foreground">Signed in as</p>
            <p className="text-base font-medium">{session.email}</p>
            {session.isReviewer ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary-container px-3 py-1 text-xs font-medium text-primary-container-foreground">
                <ShieldCheck className="size-3.5" aria-hidden /> Reviewer access
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                You can rate projects, write reviews and share photos.
              </p>
            )}
          </div>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={async () => {
              await supabase.auth.signOut();
              toast.success("Signed out.");
            }}
          >
            <LogOut className="mr-1.5 size-4" aria-hidden /> Sign out
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="display-lg">{mode === "signin" ? "Sign in" : "Create your account"}</h1>
        <p className="text-sm text-muted-foreground">
          You only need an account to add your own rating, review or photo. Browsing projects is
          open to everyone. You can still post anonymously — your name is hidden, your account stays
          linked privately for moderation.
        </p>

        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <Button
            type="button"
            size="lg"
            disabled={busy}
            onClick={google}
            className="h-12 w-full rounded-full text-base"
          >
            Continue with Google
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Fastest way in — one tap, no password to remember.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-outline" />
          or use email
          <span className="h-px flex-1 bg-outline" />
        </div>

        <form
          onSubmit={submit}
          className="space-y-3 rounded-xl border border-border bg-surface p-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg bg-surface-container-high"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-lg bg-surface-container-high"
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full rounded-full">
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          type="button"
          className="text-sm text-primary underline underline-offset-4"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </AppShell>
  );
}
