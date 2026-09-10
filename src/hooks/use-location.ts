import { useCallback, useEffect, useState } from "react";

export type LocationState =
  | { status: "idle" }
  | { status: "locating" }
  | {
      status: "granted";
      lat: number;
      lng: number;
      label: string;
      /**
       * True only when this came from the device itself.
       *
       * A city somebody picked from a menu and a GPS fix both end up here, and
       * for most of the app they are interchangeable. They are not
       * interchangeable for "near you": a fix is worth trusting to a few
       * hundred metres, a picked city is worth trusting to the city.
       */
      precise: boolean;
    }
  | { status: "denied" }
  | { status: "unavailable" };

const STORAGE_KEY = "wtf.location";

export function useLocation() {
  const [state, setState] = useState<LocationState>({ status: "idle" });

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as {
        lat: number;
        lng: number;
        label: string;
        precise?: boolean;
      };
      setState({ status: "granted", precise: false, ...parsed });
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const remember = useCallback((lat: number, lng: number, label: string, precise: boolean) => {
    const next = { lat, lng, label, precise };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setState({ status: "granted", ...next });
  }, []);

  /** Somebody chose a place. Accurate to a city, not to a street. */
  const setManual = useCallback(
    (lat: number, lng: number, label: string) => remember(lat, lng, label, false),
    [remember],
  );

  const clear = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setState({ status: "idle" });
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unavailable" });
      return;
    }
    setState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        remember(
          position.coords.latitude,
          position.coords.longitude,
          "Your current location",
          true,
        );
      },
      (error) => {
        setState({ status: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable" });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }, [remember]);

  return { state, request, setManual, clear };
}
