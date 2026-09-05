import { useCallback, useEffect, useState } from "react";

export type LocationState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "granted"; lat: number; lng: number; label: string }
  | { status: "denied" }
  | { status: "unavailable" };

const STORAGE_KEY = "wtf.location";

export function useLocation() {
  const [state, setState] = useState<LocationState>({ status: "idle" });

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { lat: number; lng: number; label: string };
      setState({ status: "granted", ...parsed });
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const setManual = useCallback((lat: number, lng: number, label: string) => {
    const next = { lat, lng, label };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setState({ status: "granted", ...next });
  }, []);

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
        setManual(
          position.coords.latitude,
          position.coords.longitude,
          "Your current location",
        );
      },
      (error) => {
        setState({ status: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable" });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }, [setManual]);

  return { state, request, setManual, clear };
}
