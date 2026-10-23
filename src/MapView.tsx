import { useEffect, useRef, useState } from "react";
import type { Map as MapType, Marker as MarkerType } from "maplibre-gl";
import { LocateFixed, Minus, Plus, MapPin } from "lucide-react";
import type { Evidence, Decision } from "../core/types.ts";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

type Props = {
  evidence: Evidence | null;
  decision: Decision | null;
  selected: string | null;
  onSelect: (id: string) => void;
  view: "city" | "taste";
};
export function MapView({
  evidence,
  decision,
  selected,
  onSelect,
  view,
}: Props) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<MapType | null>(null),
    markers = useRef<MarkerType[]>([]);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  useEffect(() => {
    let disposed = false;
    void import("maplibre-gl")
      .then((lib) => {
        if (disposed || !container.current) return;
        try {
          lib.setWorkerUrl(workerUrl);
          const m = new lib.Map({
            container: container.current,
            style: "https://tiles.openfreemap.org/styles/positron",
            center: [-73.975, 40.756],
            zoom: 11.3,
            attributionControl: { compact: true },
            pitch: 0,
            maxPitch: 0,
          });
          map.current = m;
          m.on("load", () => {
            if (disposed) return;
            for (const layer of m.getStyle().layers ?? []) {
              if (
                layer.type === "fill" &&
                /water/.test(layer.id) &&
                !/waterway/.test(layer.id)
              )
                m.setPaintProperty(layer.id, "fill-color", "#bfd1cc");
              if (layer.type === "background")
                m.setPaintProperty(layer.id, "background-color", "#e9e7df");
            }
            setFailed(false);
            setReady(true);
          });
          m.on("error", () => {
            if (!disposed && !m.isStyleLoaded()) setFailed(true);
          });
          const resize = new ResizeObserver(() => m.resize());
          resize.observe(container.current);
          m.once("remove", () => resize.disconnect());
        } catch {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    let cancelled = false;
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    void import("maplibre-gl").then((lib) => {
      if (cancelled || !evidence) return;
      for (const place of evidence.places) {
        const rank =
          decision?.ranking.findIndex((x) => x.id === place.id) ?? -1;
        const vetoed = decision?.vetoes.includes(place.id);
        if (vetoed) continue;
        const el = document.createElement("button");
        el.type = "button";
        el.className = `place-marker ${rank >= 0 && rank < 3 ? "top" : ""} ${selected === place.id ? "selected" : ""}`;
        el.textContent = rank >= 0 && rank < 3 ? String(rank + 1) : "·";
        el.setAttribute(
          "aria-label",
          `${place.name}${rank >= 0 ? `, rank ${rank + 1}` : ""}`,
        );
        el.addEventListener("click", () => callback.current(place.id));
        const marker = new lib.Marker({ element: el, anchor: "bottom" })
          .setLngLat([place.lon, place.lat])
          .addTo(m);
        markers.current.push(marker);
      }
    });
    return () => {
      cancelled = true;
      markers.current.forEach((x) => x.remove());
    };
  }, [evidence, decision, selected, ready]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !evidence?.places.length) return;
    const xs = evidence.places.map((p) => p.lon),
      ys = evidence.places.map((p) => p.lat);
    m.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      {
        padding: { top: 150, bottom: 120, left: 65, right: 65 },
        maxZoom: 13,
        duration: 1000,
      },
    );
  }, [evidence?.id, ready]);
  const focus = () => {
    if (evidence?.places.length) {
      const p =
        evidence.places.find((p) => p.id === selected) ?? evidence.places[0];
      map.current?.flyTo({ center: [p.lon, p.lat], zoom: 13, duration: 800 });
    } else
      map.current?.flyTo({
        center: [-73.975, 40.756],
        zoom: 11.3,
        duration: 800,
      });
  };
  return (
    <div className={`map-stage ${view === "taste" ? "taste-active" : ""}`}>
      <div
        className="real-map"
        ref={container}
        role="region"
        aria-label="Interactive map of New York place candidates"
      />
      <div className="map-grain" />
      {(!ready || failed) && (
        <div className="map-status">
          {failed
            ? "The map could not load. Every place remains available in the list."
            : "Opening New York…"}
        </div>
      )}
      {!evidence && (
        <div className="map-intro" aria-hidden="true">
          <div className="map-ring ring-one" />
          <div className="map-ring ring-two" />
          <span className="map-cross cross-one">+</span>
          <span className="map-cross cross-two">+</span>
          <div className="city-label">
            <span>40.7128° N · 74.0060° W</span>
            <strong>New York</strong>
            <em>A city. A thousand ways in.</em>
          </div>
          <span className="map-annotation">
            Start with your culture.
            <br />
            See where it takes you.
          </span>
        </div>
      )}
      {view === "taste" && evidence && decision && (
        <div className="taste-chart">
          <div className="chart-heading">
            <span className="eyebrow">A different kind of map</span>
            <h2>Where your worlds meet.</h2>
            <p>
              Positions come from Qloo’s order within this shortlist. They show
              cultural association, not geographic distance.
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
                    left: `${8 + r.features[0] * 84}%`,
                    bottom: `${8 + r.features[1] * 84}%`,
                  }}
                  onClick={() => onSelect(r.id)}
                  aria-label={`${p.name}, ${Math.round(r.features[0] * 100)} and ${Math.round(r.features[1] * 100)} ordinal feature values`}
                  title={p.name}
                >
                  {i < 3 ? i + 1 : "·"}
                </button>
              );
            })}
            <span className="axis-x">{evidence.references[0].name} →</span>
            <span className="axis-y">{evidence.references[1].name} →</span>
          </div>
          <div className="chart-note">
            {evidence.references.length === 3
              ? "This view projects the first two references. All three contribute to the decision."
              : "Top picks are numbered. Select a point to inspect its evidence."}
          </div>
        </div>
      )}
      <div className="map-corner">
        <span className="tiny-compass">
          N<span>↑</span>
        </span>
        <div className="map-controls">
          <button aria-label="Zoom in" onClick={() => map.current?.zoomIn()}>
            <Plus size={17} />
          </button>
          <button aria-label="Zoom out" onClick={() => map.current?.zoomOut()}>
            <Minus size={17} />
          </button>
          <button aria-label="Center map" onClick={focus}>
            <LocateFixed size={17} />
          </button>
        </div>
      </div>
      <div className="map-footnote">
        <MapPin size={13} />
        <span>NEW YORK CITY</span>
        <span className="map-footnote-line" />
        <span>
          {evidence
            ? `${decision?.ranking.length ?? 0} places in view`
            : "An exploration through culture"}
        </span>
      </div>
    </div>
  );
}
