import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, Disc3, Film, MapPin } from "lucide-react";
import type { Decision, Evidence, Place } from "../core/types.ts";

export function PlaceImage({
  place,
  className = "",
}: {
  place: Place;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false),
    [broken, setBroken] = useState(false);
  return (
    <div className={`place-image ${className}`}>
      {!loaded && (
        <div className="photo-fallback">
          <MapPin size={32} />
          <span>
            {place.image && !broken
              ? "Loading venue photo…"
              : "Venue photo unavailable"}
          </span>
        </div>
      )}
      {place.image && !broken && (
        <img
          src={place.image}
          alt={place.name}
          decoding="async"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={(event) =>
            event.currentTarget.naturalWidth >= 16
              ? setLoaded(true)
              : setBroken(true)
          }
          onError={() => setBroken(true)}
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}

export function AnimatedShortlist({
  evidence,
  decision,
  selected,
  onSelect,
}: {
  evidence: Evidence;
  decision: Decision;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const order = decision.ranking
    .slice(0, 3)
    .map((r) => r.id)
    .join("|");
  useLayoutEffect(() => {
    if (!list.current) return;
    const next = new Map<string, number>();
    for (const item of list.current.querySelectorAll<HTMLElement>(
      "[data-place-id]",
    )) {
      const id = item.dataset.placeId!,
        y = item.offsetTop,
        before = positions.current.get(id);
      next.set(id, y);
      item.getAnimations().forEach((animation) => animation.cancel());
      if (
        before !== undefined &&
        before !== y &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        item.animate(
          [
            { transform: `translateY(${before - y}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
      }
    }
    positions.current = next;
  }, [order]);
  return (
    <div className="shortlist" ref={list}>
      {decision.ranking.slice(0, 3).map((r, i) => {
        const place = evidence.places.find((p) => p.id === r.id)!;
        return (
          <button
            key={r.id}
            data-place-id={r.id}
            className={`shortlist-card ${selected === r.id ? "active" : ""}`}
            aria-pressed={selected === r.id}
            onClick={() => onSelect(r.id)}
          >
            <span className="rank-number">{i + 1}</span>
            <PlaceImage place={place} />
            <span className="shortlist-card-text">
              <strong>{place.name}</strong>
              <small>
                {i === 0
                  ? "Leading your shortlist"
                  : (place.category ?? "Another place to explore")}
              </small>
            </span>
            <ArrowUpRight size={18} />
          </button>
        );
      })}
    </div>
  );
}

// Original vector artwork: no stock image dependency and no venue-photo claim.
export function CityArtwork() {
  return (
    <div className="city-artwork" aria-hidden="true">
      <svg className="city-illustration" viewBox="0 0 620 590" fill="none">
        <defs>
          <pattern
            id="city-grid"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <path d="M24 0H0V24" stroke="#F7F5EE" strokeOpacity=".07" />
          </pattern>
          <pattern
            id="windows"
            width="22"
            height="30"
            patternUnits="userSpaceOnUse"
          >
            <path d="M7 7H12V21H7Z" fill="#D8F77E" fillOpacity=".55" />
          </pattern>
          <pattern id="dots" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="#24352D" />
          </pattern>
        </defs>
        <path fill="url(#city-grid)" d="M0 0H620V590H0Z" />
        <circle className="art-sun" cx="367" cy="223" r="172" fill="#D8F77E" />
        <path d="M195 223a172 172 0 0 0 344 0" fill="url(#dots)" />
        <path
          d="M28 465L517 206M52 510L565 236M100 557L607 285"
          stroke="#657B6D"
          strokeWidth="1"
        />
        <g className="art-skyline">
          <path d="M87 457V315L150 281L181 298V457Z" fill="#485E50" />
          <path d="M150 281V457H181V298Z" fill="#2A3C32" />
          <path d="M110 330H119V419H110ZM129 320H138V409H129Z" fill="#B4C4AD" />
          <path d="M185 449V207L233 182L281 207V449Z" fill="#C4B4EF" />
          <path d="M233 182V449H281V207Z" fill="#8978B0" />
          <path
            d="M202 233V404M219 223V394M249 223V394M265 233V404"
            stroke="#332A4A"
            strokeWidth="6"
          />
          <path d="M230 188V129M218 163H245" stroke="#C4B4EF" strokeWidth="5" />
          <path d="M298 444V277L358 245L409 273V444Z" fill="#F49D75" />
          <path d="M358 245V444H409V273Z" fill="#AE634D" />
          <path d="M310 292L344 274V411L310 429Z" fill="url(#windows)" />
          <path
            d="M423 427V178L450 165V133L466 123L482 133V165L510 179V427Z"
            fill="#B2C8B7"
          />
          <path d="M466 123V427H510V179L482 165V133Z" fill="#708D78" />
          <path d="M466 125V74" stroke="#B2C8B7" strokeWidth="3" />
          <path
            d="M440 206V363M455 194V355M480 194V355M496 206V363"
            stroke="#2A4032"
            strokeWidth="5"
          />
        </g>
        <g className="art-bridge">
          <path d="M50 481L591 388L575 428L33 524Z" fill="#D9D6C6" />
          <path d="M33 524L575 428V448L33 545Z" fill="#7C8876" />
          <path
            d="M128 486V375L152 370V480M467 428V309L491 304V422"
            stroke="#F5F1E3"
            strokeWidth="9"
          />
          <path
            d="M140 379Q298 488 478 313M140 379Q77 470 41 494M478 313Q537 397 588 391"
            stroke="#F5F1E3"
            strokeWidth="2"
          />
          {Array.from({ length: 14 }, (_, i) => (
            <path
              key={i}
              d={`M${162 + i * 22} ${398 + Math.sin((i / 13) * Math.PI) * 36 - i * 6.6}V${486 - i * 3.9}`}
              stroke="#F5F1E3"
              strokeWidth="1.5"
            />
          ))}
        </g>
        <path
          d="M113 552L584 469"
          stroke="#D8F77E"
          strokeWidth="2"
          strokeDasharray="4 10"
        />
        <circle cx="551" cy="118" r="12" stroke="#F5F1E3" strokeWidth="2" />
        <path d="M551 94V142M527 118H575" stroke="#F5F1E3" strokeWidth="2" />
      </svg>
      <div className="art-ticket ticket-music">
        <span className="record-art">
          <Disc3 size={57} strokeWidth={1} />
        </span>
        <span>
          On repeat.<strong>Your music.</strong>
        </span>
      </div>
      <div className="art-ticket ticket-film">
        <Film size={28} strokeWidth={1.5} />
        <span>
          Still with you.<strong>Your films.</strong>
        </span>
      </div>
      <div className="art-location">
        <MapPin size={18} /> New York, through your eyes.
      </div>
    </div>
  );
}
