import { useEffect, useRef, useState } from "react";
import type { Map as MapType, Marker as MarkerType } from "maplibre-gl";
import { LocateFixed, Minus, Plus, MapPin, RotateCcw } from "lucide-react";
import type { Evidence, Decision } from "../core/types.ts";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

type Props = {
  evidence: Evidence;
  decision: Decision;
  selected: string | null;
  onSelect: (id: string) => void;
  view: "city" | "taste";
  active: boolean;
};
type Camera = { center: [number, number]; zoom: number };
const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function MapView({
  evidence,
  decision,
  selected,
  onSelect,
  view,
  active,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapType | null>(null);
  const library = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef(new globalThis.Map<string, MarkerType>());
  const callback = useRef(onSelect);
  const evidenceRef = useRef(evidence);
  const camera = useRef<Camera | null>(null);
  const fittedEvidence = useRef<string | null>(null);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  callback.current = onSelect;
  evidenceRef.current = evidence;

  useEffect(() => {
    // The connections view does not keep an active geographic renderer behind it.
    if (view !== "city" || !active) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let frame = 0;
    let ownedMap: MapType | undefined;
    let removeContextListeners: (() => void) | undefined;
    setReady(false);
    setFailed(false);
    void import("maplibre-gl")
      .then((lib) => {
        if (disposed || !container.current) return;
        try {
          library.current = lib;
          lib.setWorkerUrl(workerUrl);
          const m = new lib.Map({
            container: container.current,
            style: "https://tiles.openfreemap.org/styles/positron",
            center: camera.current?.center ?? [-73.975, 40.756],
            zoom: camera.current?.zoom ?? 11.3,
            attributionControl: { compact: true },
            maxPitch: 0,
            pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
            fadeDuration: reducedMotion() ? 0 : 180,
          });
          ownedMap = m;
          map.current = m;
          const reportCamera = () => {
            const center = m.getCenter();
            camera.current = {
              center: [center.lng, center.lat],
              zoom: m.getZoom(),
            };
            if (container.current) {
              container.current.dataset.mapCenter = `${center.lng},${center.lat}`;
              container.current.dataset.mapZoom = String(m.getZoom());
            }
          };
          m.on("moveend", reportCamera);
          m.on("load", () => {
            if (!disposed) {
              setFailed(false);
              setReady(true);
              reportCamera();
            }
          });
          m.on("error", () => {
            if (!disposed && !m.isStyleLoaded()) setFailed(true);
          });
          const lost = () => {
            if (!disposed) setFailed(true);
          };
          const recovered = () => {
            if (!disposed) {
              setFailed(false);
              m.triggerRepaint();
            }
          };
          m.getCanvas().addEventListener("webglcontextlost", lost);
          m.getCanvas().addEventListener("webglcontextrestored", recovered);
          removeContextListeners = () => {
            m.getCanvas().removeEventListener("webglcontextlost", lost);
            m.getCanvas().removeEventListener(
              "webglcontextrestored",
              recovered,
            );
          };
          let width = container.current.clientWidth,
            height = container.current.clientHeight;
          observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (
              !rect ||
              !rect.width ||
              !rect.height ||
              (rect.width === width && rect.height === height)
            )
              return;
            width = rect.width;
            height = rect.height;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
              if (!disposed) m.resize();
            });
          });
          observer.observe(container.current);
        } catch {
          if (!disposed) setFailed(true);
        }
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      removeContextListeners?.();
      markers.current.forEach((marker) => marker.remove());
      markers.current.clear();
      ownedMap?.stop();
      ownedMap?.remove();
      if (map.current === ownedMap) map.current = null;
    };
  }, [view, attempt, active]);

  useEffect(() => {
    const m = map.current,
      lib = library.current;
    if (view !== "city" || !active || !m || !lib || !ready) return;
    const retained = new Set<string>();
    const ranks = new globalThis.Map(decision.ranking.map((r, i) => [r.id, i]));
    for (const place of evidence.places) {
      if (decision.vetoes.includes(place.id)) continue;
      retained.add(place.id);
      let marker = markers.current.get(place.id);
      if (!marker) {
        const el = document.createElement("button");
        el.type = "button";
        el.dataset.placeId = place.id;
        el.addEventListener("click", () => callback.current(place.id));
        marker = new lib.Marker({ element: el, anchor: "bottom" })
          .setLngLat([place.lon, place.lat])
          .addTo(m);
        markers.current.set(place.id, marker);
      }
      const rank = ranks.get(place.id) ?? -1,
        el = marker.getElement();
      el.className = `place-marker ${rank >= 0 && rank < 3 ? "top" : ""} ${selected === place.id ? "selected" : ""}`;
      el.textContent = rank >= 0 ? String(rank + 1) : "·";
      el.setAttribute(
        "aria-label",
        `${place.name}${rank >= 0 ? `, rank ${rank + 1}` : ""}`,
      );
      el.setAttribute("aria-pressed", String(selected === place.id));
    }
    for (const [id, marker] of markers.current)
      if (!retained.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    // No effect cleanup here: selection and rank changes preserve marker identities.
  }, [evidence, decision, selected, ready, view, active]);

  useEffect(() => {
    const m = map.current;
    if (
      view !== "city" ||
      !active ||
      !m ||
      !ready ||
      fittedEvidence.current === evidence.id
    )
      return;
    const places = evidenceRef.current.places;
    if (!places.length) return;
    m.stop();
    m.fitBounds(
      [
        [
          Math.min(...places.map((p) => p.lon)),
          Math.min(...places.map((p) => p.lat)),
        ],
        [
          Math.max(...places.map((p) => p.lon)),
          Math.max(...places.map((p) => p.lat)),
        ],
      ],
      { padding: 64, maxZoom: 13, duration: reducedMotion() ? 0 : 650 },
    );
    fittedEvidence.current = evidence.id;
  }, [evidence.id, ready, view, active]);

  function focus() {
    const p =
      evidence.places.find((p) => p.id === selected) ?? evidence.places[0];
    if (p && map.current) {
      map.current.stop();
      map.current.flyTo({
        center: [p.lon, p.lat],
        zoom: 13,
        duration: reducedMotion() ? 0 : 650,
      });
    }
  }
  return (
    <div className={`map-stage ${view === "taste" ? "taste-active" : ""}`}>
      {view === "city" ? (
        <>
          <div
            className="real-map"
            ref={container}
            role="region"
            aria-label="Interactive map of New York place candidates"
            data-map-state={failed ? "failed" : ready ? "ready" : "loading"}
          />
          {(!ready || failed) && (
            <div className="map-status" role="status">
              <MapPin size={24} />
              <strong>
                {failed ? "The map is unavailable." : "Opening your city…"}
              </strong>
              <p>
                {failed
                  ? "Your places and directions are still available in the list."
                  : "Loading geographic context for your places."}
              </p>
              {failed && (
                <button
                  className="secondary-button"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  <RotateCcw size={16} /> Retry map
                </button>
              )}
            </div>
          )}
          <div className="map-controls">
            <button
              aria-label="Zoom in"
              onClick={() => {
                map.current?.stop();
                map.current?.zoomIn({ duration: reducedMotion() ? 0 : 250 });
              }}
            >
              <Plus size={19} />
            </button>
            <button
              aria-label="Zoom out"
              onClick={() => {
                map.current?.stop();
                map.current?.zoomOut({ duration: reducedMotion() ? 0 : 250 });
              }}
            >
              <Minus size={19} />
            </button>
            <button aria-label="Center map" onClick={focus}>
              <LocateFixed size={19} />
            </button>
          </div>
        </>
      ) : (
        <div className="taste-chart">
          <div className="chart-heading">
            <h2>Where your worlds meet.</h2>
            <p>
              Places nearer an axis end ranked higher through that reference.
              These are cultural connections, not distances.
            </p>
          </div>
          <div className="chart-plane">
            <div className="chart-grid" />
            {decision.ranking.map((r, i) => {
              const p = evidence.places.find((p) => p.id === r.id)!;
              return (
                <button
                  key={r.id}
                  className={`chart-dot ${i < 3 ? "top" : ""} ${selected === r.id ? "selected" : ""}`}
                  style={{
                    left: `${10 + r.features[0] * 78}%`,
                    bottom: `${10 + r.features[1] * 78}%`,
                  }}
                  onClick={() => onSelect(r.id)}
                  aria-label={`${p.name}, rank ${i + 1}`}
                  aria-pressed={selected === r.id}
                  title={p.name}
                >
                  {i + 1}
                </button>
              );
            })}
            <span className="axis-x">{evidence.references[0].name} →</span>
            <span className="axis-y">{evidence.references[1].name} →</span>
          </div>
          {evidence.references.length === 3 && (
            <p className="chart-note">
              This view shows the first two references. All three contribute to
              your decision.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
