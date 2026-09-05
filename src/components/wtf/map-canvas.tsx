import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { LatLngTuple, LayerGroup, Map as LeafletMap, Marker } from "leaflet";

import "leaflet/dist/leaflet.css";

import type { Project } from "@/lib/queries";
import { STATUS_DOT, STATUS_LABEL, type ProjectStatus } from "@/lib/wtf";
import { cn } from "@/lib/utils";

/**
 * Real OpenStreetMap canvas. Leaflet touches `document` and `window` the moment it
 * is imported, so the library is pulled in lazily inside an effect (the route that
 * renders this component is also rendered on the server). Only the stylesheet is a
 * static import, so the bundler emits it with the rest of the app CSS.
 */
type LeafletApi = typeof import("leaflet");

const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
/** Required by the ODbL licence for OpenStreetMap tiles. Do not drop this. */
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Fallback view when nothing on screen has coordinates. */
const INDIA_CENTER: LatLngTuple = [22.4, 79.2];
const INDIA_ZOOM = 4;
/** Stops a single pin from zooming all the way into street level. */
const MAX_FIT_ZOOM = 11;

type Pin = { id: string; name: string; status: ProjectStatus; lat: number; lng: number };
type PinMarker = { marker: Marker; status: ProjectStatus; selected: boolean };

function isCoordinate(lat: number | null, lng: number | null): boolean {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/**
 * Status pins are plain DOM, so they inherit the app's status colours instead of
 * Leaflet's default blue PNG (whose URLs break under a bundler anyway).
 */
function statusIcon(api: LeafletApi, status: ProjectStatus, selected: boolean) {
  const size = selected ? 22 : 14;
  const dot = cn(
    "block rounded-full shadow-sm ring-2 ring-surface",
    STATUS_DOT[status],
    selected && "ring-4 ring-primary",
  );
  return api.divIcon({
    className: "wtf-map-pin",
    html: `<span class="${dot}" style="width:${size}px;height:${size}px"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function youIcon(api: LeafletApi) {
  return api.divIcon({
    className: "wtf-map-you",
    html:
      '<span class="flex size-6 items-center justify-center rounded-full bg-primary/25">' +
      '<span class="block size-3 rounded-full bg-primary ring-2 ring-surface"></span>' +
      "</span>",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export function MapCanvas({
  projects,
  you,
  selectedId,
  onSelect,
}: {
  projects: Project[];
  you?: { lat: number; lng: number } | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [api, setApi] = useState<LeafletApi | null>(null);
  const [map, setMap] = useState<LeafletMap | null>(null);

  const pins = useMemo<Pin[]>(
    () =>
      projects
        .filter((item) => isCoordinate(item.latitude, item.longitude))
        .map((item) => ({
          id: item.id,
          name: item.name,
          status: item.status,
          lat: item.latitude!,
          lng: item.longitude!,
        })),
    [projects],
  );

  // The parent rebuilds its `projects` array on every render, so markers are keyed
  // off the data itself. Without this the map would refit (and throw away the
  // reader's pan and zoom) on unrelated re-renders.
  const pinsKey = useMemo(
    () => pins.map((pin) => `${pin.id}:${pin.lat},${pin.lng}:${pin.status}`).join("|"),
    [pins],
  );
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  const youLat = you && Number.isFinite(you.lat) ? you.lat : null;
  const youLng = you && Number.isFinite(you.lng) ? you.lng : null;

  const markersRef = useRef(new Map<string, PinMarker>());
  const lastPannedRef = useRef<string | null>(null);

  // The map can be mounted while its tab is still laid out at 0x0 (the parent
  // renders it on demand, and the box can be measured before it has been sized).
  // Fitting the view then picks a nonsense zoom, so the fit is parked until the
  // container really has a size.
  const pendingFitRef = useRef<(() => void) | null>(null);
  const runPendingFit = useCallback(() => {
    const element = containerRef.current;
    const fit = pendingFitRef.current;
    if (!fit || !element || element.clientWidth === 0 || element.clientHeight === 0) return;
    pendingFitRef.current = null;
    fit();
  }, []);

  // Kept in a ref so re-binding the click handler never means rebuilding markers.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // 1. Load Leaflet in the browser only.
  useEffect(() => {
    let alive = true;
    void import("leaflet").then((mod) => {
      if (!alive) return;
      const loaded = mod as LeafletApi & { default?: LeafletApi };
      setApi(loaded.default ?? loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 2. Create the map exactly once per mount. StrictMode runs this twice: the
  // cleanup calls map.remove(), which frees the container so the second run can
  // initialise it again instead of throwing "Map container is already initialized".
  useEffect(() => {
    const element = containerRef.current;
    if (!api || !element) return;

    const instance = api.map(element, {
      center: INDIA_CENTER,
      zoom: INDIA_ZOOM,
      minZoom: 3,
      maxZoom: 18,
      // The map sits inside a scrolling page, so the wheel only zooms once the
      // reader has actually clicked into the map.
      scrollWheelZoom: false,
      attributionControl: true,
    });
    instance.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    api
      .tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 18, detectRetina: true })
      .addTo(instance);

    const enableWheel = () => instance.scrollWheelZoom.enable();
    const disableWheel = () => instance.scrollWheelZoom.disable();
    instance.on("click focus", enableWheel);
    instance.on("mouseout blur", disableWheel);

    // The map lives in a tab that starts hidden, so it can be laid out at 0x0.
    // Watching the container catches the moment it gains a size, which is also when
    // a deferred fit becomes meaningful.
    const handleResize = () => {
      instance.invalidateSize();
      runPendingFit();
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleResize);
    observer?.observe(element);
    const raf = requestAnimationFrame(handleResize);

    setMap(instance);
    return () => {
      pendingFitRef.current = null;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      instance.off();
      instance.remove();
      setMap(null);
    };
  }, [api, runPendingFit]);

  // 3. Rebuild markers when the project set really changes, then fit the view.
  useEffect(() => {
    if (!api || !map) return;
    const current = pinsRef.current;

    const group: LayerGroup = api.layerGroup().addTo(map);
    const markers = new Map<string, PinMarker>();
    for (const pin of current) {
      const marker = api.marker([pin.lat, pin.lng], {
        icon: statusIcon(api, pin.status, false),
        title: `${pin.name} — ${STATUS_LABEL[pin.status]}`,
        alt: `${pin.name} — ${STATUS_LABEL[pin.status]}`,
        keyboard: true,
        riseOnHover: true,
      });
      marker.on("click", () => onSelectRef.current?.(pin.id));
      group.addLayer(marker);
      markers.set(pin.id, { marker, status: pin.status, selected: false });
    }
    markersRef.current = markers;

    const points: LatLngTuple[] = current.map((pin) => [pin.lat, pin.lng]);
    if (youLat != null && youLng != null) points.push([youLat, youLng]);
    pendingFitRef.current = () => {
      map.invalidateSize();
      if (points.length > 0) {
        map.fitBounds(api.latLngBounds(points), {
          padding: [36, 36],
          maxZoom: MAX_FIT_ZOOM,
          animate: false,
        });
      } else {
        map.setView(INDIA_CENTER, INDIA_ZOOM, { animate: false });
      }
    };
    runPendingFit();

    return () => {
      pendingFitRef.current = null;
      group.clearLayers();
      group.remove();
      markersRef.current = new Map();
    };
  }, [api, map, pinsKey, youLat, youLng, runPendingFit]);

  // 4. The reader's own position, deliberately not a status colour.
  useEffect(() => {
    if (!api || !map || youLat == null || youLng == null) return;
    const marker = api
      .marker([youLat, youLng], {
        icon: youIcon(api),
        title: "You are here",
        alt: "You are here",
        interactive: false,
        zIndexOffset: 500,
      })
      .addTo(map);
    return () => {
      marker.remove();
    };
  }, [api, map, youLat, youLng]);

  // 5. Highlight the selected pin and bring it into view. Runs after the marker
  // effect, so it also re-applies the highlight to freshly rebuilt markers.
  useEffect(() => {
    if (!api || !map) return;
    for (const [id, entry] of markersRef.current) {
      const selected = id === selectedId;
      if (selected === entry.selected) continue;
      entry.selected = selected;
      entry.marker.setIcon(statusIcon(api, entry.status, selected));
      entry.marker.setZIndexOffset(selected ? 1000 : 0);
    }

    const target = selectedId ? markersRef.current.get(selectedId) : null;
    if (target && selectedId !== lastPannedRef.current) {
      const point = target.marker.getLatLng();
      if (!map.getBounds().pad(-0.15).contains(point)) map.panTo(point);
    }
    lastPannedRef.current = selectedId ?? null;
  }, [api, map, selectedId, pinsKey]);

  const selected = projects.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface-container">
      <div className="relative aspect-4/5 min-h-80 w-full sm:aspect-16/10">
        {/* Leaflet needs a sized box of its own, hence the explicit inset-0. */}
        <div
          ref={containerRef}
          className="absolute inset-0 z-0 bg-surface-container"
          role="region"
          aria-label="Map of India showing government project locations"
        />
        {pins.length === 0 ? (
          <p className="pointer-events-none absolute inset-x-4 bottom-4 z-10 rounded-2xl bg-surface-container-high/90 p-3 text-center text-xs text-muted-foreground">
            None of these projects has a published location yet.
          </p>
        ) : null}
      </div>

      {selected ? (
        <div className="border-t border-border bg-surface-container-high p-3">
          <p className="text-xs text-muted-foreground">
            {[selected.district, selected.state].filter(Boolean).join(", ")} ·{" "}
            {STATUS_LABEL[selected.status]}
          </p>
          <Link
            to="/projects/$projectId"
            params={{ projectId: selected.id }}
            className="text-sm font-semibold text-primary underline underline-offset-4"
          >
            {selected.name}
          </Link>
        </div>
      ) : (
        <p className="border-t border-border p-3 text-xs text-muted-foreground">
          Tap a dot to see which project it is.
        </p>
      )}
    </div>
  );
}
