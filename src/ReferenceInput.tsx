import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Disc3, Film, Search, X } from "lucide-react";
import type { Reference } from "../core/types.ts";
import { resolveReferences } from "./api.ts";

export function ReferenceInput({
  index,
  value,
  kind,
  onChange,
  onKind,
  onRemove,
  disabled,
}: {
  index: number;
  value: Reference | null;
  kind: Reference["kind"];
  onChange: (r: Reference | null) => void;
  onKind: (k: Reference["kind"]) => void;
  onRemove?: () => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<Reference[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null),
    revision = useRef(0);
  useEffect(
    () => () => {
      revision.current++;
      pending.current?.abort();
    },
    [],
  );
  const run = async () => {
    if (query.trim().length < 2 || busy) return;
    const rev = ++revision.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      const r = await resolveReferences(query, kind, controller.signal);
      if (rev === revision.current) {
        setResults(r.references);
        if (!r.references.length)
          setError(
            "No matching identities. Try a fuller name or switch the reference type.",
          );
      }
    } catch (e) {
      if (
        rev === revision.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      if (rev === revision.current) setBusy(false);
    }
  };
  const changeKind = (k: Reference["kind"]) => {
    revision.current++;
    pending.current?.abort();
    setBusy(false);
    setResults(null);
    setError("");
    onKind(k);
  };
  return (
    <div className={`reference-input lens-${index}`}>
      <div className="reference-label">
        <span>
          <i />
          {index === 2
            ? "Another side of you"
            : kind === "artist"
              ? "An artist on repeat"
              : "A film that stays with you"}
        </span>
        {onRemove && (
          <button
            className="icon-button"
            aria-label="Remove third reference"
            onClick={onRemove}
            disabled={disabled}
          >
            <X size={15} />
          </button>
        )}
      </div>
      {value ? (
        <div className="confirmed-reference">
          <div className="reference-type-icon" aria-hidden="true">
            {value.kind === "artist" ? <Disc3 size={24} /> : <Film size={24} />}
          </div>
          <div>
            <strong>{value.name}</strong>
            <span>
              {value.kind === "artist" ? "Music artist" : "Film"}
              {value.year ? ` · ${value.year}` : ""} <Check size={12} />
            </span>
          </div>
          <button
            className="icon-button"
            onClick={() => {
              onChange(null);
              setResults(null);
              setQuery("");
            }}
            aria-label={`Change ${value.name}`}
            disabled={disabled}
          >
            <X size={17} />
          </button>
        </div>
      ) : (
        <>
          <div className="kind-switch">
            <button
              type="button"
              aria-pressed={kind === "artist"}
              onClick={() => changeKind("artist")}
              disabled={disabled}
            >
              <Disc3 size={13} />
              Music artist
            </button>
            <button
              type="button"
              aria-pressed={kind === "movie"}
              onClick={() => changeKind("movie")}
              disabled={disabled}
            >
              <Film size={13} />
              Film
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <label className="sr-only" htmlFor={`reference-${index}`}>
              Search {kind === "artist" ? "music artist" : "film"} {index + 1}
            </label>
            <input
              id={`reference-${index}`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setResults(null);
                setError("");
              }}
              placeholder={
                kind === "artist"
                  ? "An artist you keep coming back to…"
                  : "A film that stayed with you…"
              }
              autoComplete="off"
              maxLength={100}
              disabled={disabled}
            />
            <button
              type="submit"
              className="search-submit"
              disabled={disabled || busy || query.trim().length < 2}
              aria-label={`Search reference ${index + 1}`}
            >
              {busy ? <span className="spinner" /> : <Search size={18} />}
            </button>
          </form>
        </>
      )}
      {error && (
        <p role="alert" className="input-error">
          {error}
        </p>
      )}
      {!value && results && results.length > 0 && (
        <div className="identity-results">
          <span className="eyebrow">Confirm the identity you mean</span>
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onChange(r);
                setResults(null);
              }}
            >
              <div>
                <strong>{r.name}</strong>
                <small>
                  {r.kind === "artist" ? "Music artist" : "Film"}
                  {r.year ? ` · ${r.year}` : ""}
                  {r.description
                    ? ` · ${r.description.slice(0, 130)}${r.description.length > 130 ? "…" : ""}`
                    : ""}
                </small>
              </div>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
