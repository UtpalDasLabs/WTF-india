import { useEffect, useState } from "react";

import { deviceId } from "@/hooks/use-device-id";
import { claimPosts } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";

export type SessionState = {
  loading: boolean;
  userId: string | null;
  email: string | null;
  isReviewer: boolean;
  roles: string[];
};

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    loading: true,
    userId: null,
    email: null,
    isReviewer: false,
    roles: [],
  });

  useEffect(() => {
    let active = true;

    // Signing in adopts whatever this browser has already posted. Without it an
    // account is only an identity for star ratings, and somebody who posts on
    // their phone then opens the site on a laptop finds no delete button on
    // their own post.
    const claim = (userId: string | null) => {
      if (!userId) return;
      const device = deviceId();
      if (!device) return;
      void claimPosts(device).catch(() => {
        // Offline, or nothing to adopt. Ownership by device still stands.
      });
    };

    const loadRoles = async (userId: string | null, email: string | null) => {
      if (!userId) {
        if (active) {
          setState({ loading: false, userId: null, email: null, isReviewer: false, roles: [] });
        }
        return;
      }
      const { data } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const roles = ((data ?? []) as Array<{ role: string }>).map((row) => row.role);
      if (active) {
        setState({
          loading: false,
          userId,
          email,
          roles,
          isReviewer: roles.includes("admin") || roles.includes("reviewer"),
        });
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      claim(data.session?.user.id ?? null);
      void loadRoles(data.session?.user.id ?? null, data.session?.user.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      claim(session?.user.id ?? null);
      void loadRoles(session?.user.id ?? null, session?.user.email ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
