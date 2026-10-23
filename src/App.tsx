import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Code2,
  Download,
  ExternalLink,
  History,
  Info,
  Layers3,
  Map,
  MapPin,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type {
  Answer,
  Choice,
  Evidence,
  Place,
  Profile,
  Reference,
} from "../core/types.ts";
import { advise, MODEL, NOISE, QUESTION_COST } from "../core/engine.ts";
import { ReferenceInput } from "./ReferenceInput.tsx";
import { MapView } from "./MapView.tsx";
import { forgetEvidence, prepare, resolveReferences } from "./api.ts";
import { download, importSchema, loadProfile, saveProfile } from "./storage.ts";

const labels: Record<Choice, string> = {
  a: "First place",
  b: "Second place",
  both: "Both look acceptable",
  neither: "Neither for this outing",
  skip: "Not enough information",
};
const noRefs: [null, null] = [null, null];
const prettyTime = (d: string) =>
  new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function PlaceImage({
  place,
  className = "",
}: {
  place: Place;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`place-image ${className}`}>
      {!loaded && (
        <div className="photo-fallback" title="Venue photograph has not loaded">
          <MapPin size={24} />
          <span>{place.category ?? "New York place"}</span>
        </div>
      )}
      {place.image && !broken && (
        <img
          src={place.image}
          alt={place.name}
          loading="eager"
          decoding="async"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={(event) => {
            if (event.currentTarget.naturalWidth >= 16) setLoaded(true);
            else setBroken(true);
          }}
          onError={() => setBroken(true)}
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}

export default function App() {
  const [references, setReferences] = useState<(Reference | null)[]>(noRefs),
    [kinds, setKinds] = useState<Reference["kind"][]>(["artist", "movie"]);
  const [evidence, setEvidence] = useState<Evidence | null>(null),
    [answers, setAnswers] = useState<Answer[]>([]),
    [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false),
    [exampleBusy, setExampleBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [modal, setModal] = useState<
      "about" | "history" | "evidence" | "agent" | "balance" | null
    >(null),
    [view, setView] = useState<"city" | "taste">("city");
  const [selected, setSelected] = useState<string | null>(null),
    [manual, setManual] = useState<number[] | null>(null),
    [hydrated, setHydrated] = useState(false),
    [restored, setRestored] = useState(false),
    [storageOk, setStorageOk] = useState(true);
  const [showCompare, setShowCompare] = useState(true),
    [saved, setSaved] = useState(false);
  const [inputEpoch, setInputEpoch] = useState(0);
  const pending = useRef<AbortController | null>(null),
    generation = useRef(0),
    importInput = useRef<HTMLInputElement>(null),
    modalRef = useRef<HTMLDivElement>(null),
    modalPrevious = useRef<HTMLElement | null>(null);
  const refs = references.filter((r): r is Reference => r !== null);
  const decision = useMemo(
    () =>
      evidence
        ? advise(evidence, answers, manual ? { manualWeights: manual } : {})
        : null,
    [evidence, answers, manual],
  );
  const top = decision?.ranking[0],
    selectedPlace = evidence?.places.find(
      (p) => p.id === (selected ?? top?.id),
    );
  const currentPair =
    decision?.question && evidence
      ? [decision.question.a, decision.question.b].map((id) =>
          evidence.places.find((p) => p.id === id)!,
        )
      : null;
  const eligible = decision?.ranking ?? [];
  useEffect(() => {
    let mounted = true;
    const hydrationGeneration = generation.current;
    void loadProfile()
      .then((p: Profile | undefined) => {
        if (!mounted || generation.current !== hydrationGeneration) return;
        if (p?.schema === 1 && p.references?.length >= 2) {
          setReferences(p.references);
          setKinds(p.references.map((r) => r.kind));
          setAnswers(p.answers ?? []);
          setRevision(p.revision ?? 0);
          if (
            p.evidence &&
            new Date(p.evidence.expiresAt).getTime() > Date.now()
          ) {
            try {
              advise(p.evidence, p.answers ?? []);
              setEvidence(p.evidence);
              setRestored(true);
              setNotice(
                "Restored from this device. These are previously retrieved observations, not a new Qloo request.",
              );
            } catch {
              setNotice(
                "Saved preferences were restored. Prepare a fresh search.",
              );
            }
          } else
            setNotice(
              "Your cultural references and answers were restored. Find places to retrieve fresh evidence.",
            );
        }
      })
      .catch(() => {
        if (mounted) setStorageOk(false);
      })
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const profile: Profile | null = refs.length
      ? {
          schema: 1,
          revision,
          area: "nyc",
          references: refs,
          answers,
          evidence,
          savedAt: new Date().toISOString(),
          mode: restored ? "restored" : "live",
        }
      : null;
    void saveProfile(profile).catch(() => setStorageOk(false));
  }, [references, answers, evidence, revision, hydrated, restored]);
  useEffect(() => {
    if (!modal) return;
    modalPrevious.current = document.activeElement as HTMLElement;
    const timer = setTimeout(
      () =>
        modalRef.current
          ?.querySelector<HTMLElement>("button, a, input, select, summary")
          ?.focus(),
      30,
    );
    function keys(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setModal(null);
        return;
      }
      if (e.key !== "Tab") return;
      const items = modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input, select, summary, [tabindex="0"]',
      );
      if (!items?.length) return;
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", keys);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", keys);
      modalPrevious.current?.focus();
    };
  }, [modal]);
  function invalidate() {
    generation.current++;
    pending.current?.abort();
    setBusy(false);
    setError("");
    setManual(null);
    setEvidence(null);
    setAnswers([]);
    setRevision((r) => r + 1);
    setSelected(null);
    setRestored(false);
    setSaved(false);
  }
  function changeReference(index: number, value: Reference | null) {
    invalidate();
    setReferences((old) => old.map((r, i) => (i === index ? value : r)));
  }
  async function example(pair: 1 | 2) {
    if (exampleBusy || busy) return;
    setExampleBusy(true);
    setError("");
    const gen = ++generation.current;
    const controller = new AbortController();
    pending.current = controller;
    try {
      const names =
        pair === 1
          ? ["Radiohead", "The Grand Budapest Hotel"]
          : ["Beyoncé", "Spirited Away"];
      // Sequential identity searches avoid minting multiple competing anonymous sessions.
      const a = await resolveReferences(names[0], "artist", controller.signal),
        b = await resolveReferences(names[1], "movie", controller.signal);
      const x = a.references.find(
          (r) => r.name.toLocaleLowerCase() === names[0].toLocaleLowerCase(),
        ),
        y = b.references.find(
          (r) => r.name.toLocaleLowerCase() === names[1].toLocaleLowerCase(),
        );
      if (!x || !y)
        throw new Error(
          "The example identities need manual confirmation. Search for the names above.",
        );
      if (gen !== generation.current) return;
      setReferences([x, y]);
      setKinds(["artist", "movie"]);
      setEvidence(null);
      setAnswers([]);
      setManual(null);
      setRevision((r) => r + 1);
      setNotice(
        "Example identities selected. Choose “Find my places” for a new live Qloo search.",
      );
    } catch (e) {
      if (gen === generation.current)
        setError(
          e instanceof Error ? e.message : "The example could not be resolved.",
        );
    } finally {
      if (gen === generation.current) setExampleBusy(false);
    }
  }
  async function findPlaces() {
    if (refs.length < 2 || refs.length !== references.length || busy) return;
    const gen = ++generation.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    setManual(null);
    try {
      const verified: Reference[] = [];
      for (const ref of refs) {
        if (ref.proof) {
          verified.push(ref);
          continue;
        }
        const r = await resolveReferences(
            ref.name,
            ref.kind,
            controller.signal,
          ),
          match = r.references.find((x) => x.id === ref.id);
        if (!match)
          throw new Error(`Please search and confirm ${ref.name} again.`);
        verified.push(match);
      }
      const result = await prepare(verified, controller.signal);
      if (gen !== generation.current) return;
      const ids = new Set(result.evidence.places.map((p) => p.id)),
        kept = answers.filter((a) => ids.has(a.a) && ids.has(a.b));
      setEvidence(result.evidence);
      setReferences(verified);
      setAnswers(kept);
      setRevision((r) => r + 1);
      setRestored(false);
      setSelected(null);
      setShowCompare(true);
      setSaved(false);
      if (kept.length !== answers.length)
        setNotice(
          `${answers.length - kept.length} previous comparisons did not belong to the new candidate set and were removed.`,
        );
    } catch (e) {
      if (
        gen === generation.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setError(
          e instanceof Error
            ? e.message
            : "Live search failed. Please try again.",
        );
    } finally {
      if (gen === generation.current) setBusy(false);
    }
  }
  function answer(choice: Choice) {
    if (!decision?.question) return;
    const { a, b } = decision.question;
    setAnswers((old) => [...old, { id: crypto.randomUUID(), a, b, choice }]);
    setRevision((r) => r + 1);
    setSelected(null);
    setSaved(false);
    setNotice(
      choice === "neither"
        ? "Both places are ruled out for this outing. You can undo this in your history."
        : choice === "both"
          ? "Recorded as both acceptable. No relative preference was inferred."
          : choice === "skip"
            ? "Skipped. Your cultural balance has not changed."
            : "Your answer has been applied. The shortlist has been rebuilt.",
    );
  }
  function editAnswer(id: string, choice: Choice | null) {
    setAnswers((old) =>
      choice
        ? old.map((a) => (a.id === id ? { ...a, choice } : a))
        : old.filter((a) => a.id !== id),
    );
    setRevision((r) => r + 1);
    setManual(null);
    setSelected(null);
    setNotice(
      "Rebuilt from the remaining answers. Removed answers no longer affect this decision.",
    );
    setSaved(false);
  }
  async function clearAll() {
    const id = evidence?.id;
    invalidate();
    setExampleBusy(false);
    setReferences(noRefs);
    setInputEpoch((value) => value + 1);
    setKinds(["artist", "movie"]);
    setModal(null);
    await saveProfile(null).catch(() => setStorageOk(false));
    setNotice(
      "App-managed preferences and decisions were removed from this device. Earlier exports and external provider logs are outside this action.",
    );
    if (id)
      void forgetEvidence(id).catch(() =>
        setNotice(
          "Local preferences were removed. Remote temporary evidence could not be reached; its handle expires within 30 minutes. Earlier exports and provider logs are outside this action.",
        ),
      );
  }
  function exportProfile() {
    if (refs.length < 2) return;
    const references = refs.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      ...(r.year ? { year: r.year } : {}),
    }));
    download(
      "parallax-preferences.json",
      JSON.stringify(
        {
          schema: 1,
          area: "nyc",
          references,
          answers,
          exportedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "application/json",
    );
  }
  function exportBrief() {
    if (!evidence || !decision) return;
    const lines = [
      "# Your PARALLAX field notes",
      "",
      `New York City · evidence retrieved ${evidence.retrievedAt}`,
      `Cultural references: ${refs.map((r) => r.name).join(" / ")}`,
      "",
      ...decision.ranking.slice(0, 3).flatMap((r, i) => {
        const p = evidence.places.find((p) => p.id === r.id)!;
        return [
          `## ${i + 1}. ${p.name}`,
          p.address ?? "Address not supplied.",
          `Directions: https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`,
          ...(p.website
            ? [`Official site supplied by Qloo: ${p.website}`]
            : []),
          "",
        ];
      }),
      `${answers.length} recorded comparisons. Model: ${MODEL}.`,
      `Source: Qloo Taste AI, ${evidence.workflow}. Ordinal-derived fit is not a probability of enjoyment.`,
      restored
        ? "This decision used previously retrieved observations."
        : "This decision was computed from the live observations retrieved at the timestamp above.",
      "Check current opening, entry, prices, and accessibility directly before visiting.",
      "",
      ...answers.map(
        (a, i) =>
          `Comparison ${i + 1}: ${evidence.places.find((p) => p.id === a.a)?.name ?? a.a} / ${evidence.places.find((p) => p.id === a.b)?.name ?? a.b} — ${labels[a.choice]}`,
      ),
    ];
    download("parallax-field-notes.md", lines.join("\n"), "text/markdown");
  }
  async function importFile(file: File) {
    if (file.size > 32000) {
      setError("Choose a PARALLAX preferences file smaller than 32 KB.");
      return;
    }
    try {
      const data = importSchema.parse(JSON.parse(await file.text()));
      invalidate();
      setReferences(data.references);
      setKinds(data.references.map((r) => r.kind));
      setAnswers(data.answers);
      setNotice(
        "Preferences imported. Find places to retrieve fresh evidence; imported data is not a live Qloo result.",
      );
    } catch {
      setError(
        "This is not a valid PARALLAX preferences file. No imported URL was fetched.",
      );
    }
  }
  const directions = (p: Place) =>
    `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
  const selectedRank =
    decision?.ranking.findIndex((r) => r.id === selectedPlace?.id) ?? -1;
  const selectedFeature = decision?.ranking.find(
    (r) => r.id === selectedPlace?.id,
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to the experience
      </a>
      <header className="site-header" inert={Boolean(modal)}>
        <a className="brand" href="/" aria-label="PARALLAX home">
          <svg viewBox="0 0 38 36" aria-hidden="true">
            <path d="M4 31V5h15a9 9 0 0 1 0 18H4m12 8V5h12a9 9 0 0 1 0 18H16" />
          </svg>
          <span>
            PARALLAX<span className="brand-dot">®</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className="nav-active"
            onClick={() => {
              setModal(null);
              document
                .getElementById("workspace")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Explore<span>01</span>
          </button>
          <button onClick={() => setModal("about")}>
            The idea
            <ArrowUpRight size={12} />
          </button>
          <button onClick={() => setModal("agent")}>
            For agents
            <Code2 size={14} />
          </button>
        </nav>
        <button className="header-note" onClick={() => setModal("about")}>
          <span className="live-dot" />
          CULTURE, WITH A SENSE OF PLACE
        </button>
      </header>
      <main
        id="workspace"
        tabIndex={-1}
        inert={Boolean(modal)}
        className={`workspace ${evidence ? "has-results" : ""}`}
      >
        <section className="editor-panel" aria-label="Cultural place discovery">
          <div className="editor-scroll">
            {!evidence ? (
              <>
                <div className="intro-eyebrow">
                  <span className="edition-mark">P / 001</span>
                  <span>THE NEW YORK EDITION</span>
                  <span className="small-star">✳</span>
                </div>
                <h1>
                  Your taste.
                  <br />A different
                  <br />
                  <em>New York.</em>
                  <span className="headline-orbit" aria-hidden="true">
                    ↗
                  </span>
                </h1>
                <p className="intro-copy">
                  The music you love. The films that stay with you.
                  <br />A new way to find your place in the city.
                </p>
                <div className="section-rule">
                  <span>START WITH TWO THINGS YOU LOVE</span>
                  <ArrowDown size={14} />
                </div>
                <div className="reference-stack">
                  {references.map((r, i) => (
                    <ReferenceInput
                      key={`${i}-${kinds[i]}-${inputEpoch}`}
                      index={i}
                      value={r}
                      kind={kinds[i]}
                      onChange={(r) => changeReference(i, r)}
                      onKind={(k) => {
                        invalidate();
                        setKinds((old) => old.map((x, j) => (j === i ? k : x)));
                      }}
                      onRemove={
                        i === 2
                          ? () => {
                              invalidate();
                              setReferences((old) => old.slice(0, 2));
                              setKinds((old) => old.slice(0, 2));
                            }
                          : undefined
                      }
                      disabled={busy || exampleBusy}
                    />
                  ))}
                </div>
                {references.length < 3 && (
                  <button
                    className="add-reference"
                    disabled={busy || exampleBusy}
                    onClick={() => {
                      invalidate();
                      setReferences((old) => [...old, null]);
                      setKinds((old) => [...old, "artist"]);
                    }}
                  >
                    <Plus size={14} />
                    Add another perspective<span>optional</span>
                  </button>
                )}
                <button
                  className="primary-button find-button"
                  onClick={() => void findPlaces()}
                  disabled={
                    refs.length < 2 ||
                    refs.length !== references.length ||
                    busy ||
                    exampleBusy
                  }
                >
                  {busy ? (
                    <>
                      <span className="spinner" />
                      Discovering your connections…
                    </>
                  ) : (
                    <>
                      Find my places
                      <ArrowUpRight size={20} />
                    </>
                  )}
                </button>
                {busy && (
                  <div className="loading-note" role="status">
                    <span className="loading-track" />
                    <strong>Connecting your cultural worlds.</strong>
                    <span>
                      Qloo is finding local places and ranking one shared
                      shortlist through each reference. This can take around
                      half a minute.
                    </span>
                    <button
                      onClick={() => {
                        generation.current++;
                        pending.current?.abort();
                        setBusy(false);
                        setNotice(
                          "Search cancelled. A request already sent to Qloo may still count toward the allowance.",
                        );
                      }}
                    >
                      Cancel this search
                    </button>
                  </div>
                )}
                <div className="example-block">
                  <span>NEED A STARTING POINT?</span>
                  <button
                    disabled={busy || exampleBusy}
                    onClick={() => void example(1)}
                  >
                    {exampleBusy ? (
                      <span className="spinner" />
                    ) : (
                      <>
                        <span className="example-dot dot-coral" />
                        <span>
                          Radiohead <em>×</em> Grand Budapest
                        </span>
                        <ArrowUpRight size={14} />
                      </>
                    )}
                  </button>
                  <button
                    disabled={busy || exampleBusy}
                    onClick={() => void example(2)}
                  >
                    <span className="example-dot dot-green" />
                    <span>
                      Beyoncé <em>×</em> Spirited Away
                    </span>
                    <ArrowUpRight size={14} />
                  </button>
                </div>
                <div className="intro-footer">
                  <span className="mini-symbol">↔</span>
                  <p>
                    Culture finds a connection.
                    <br />
                    <strong>Your choices give it direction.</strong>
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="result-topline">
                  <button
                    onClick={() => {
                      setEvidence(null);
                      setSelected(null);
                      setManual(null);
                      setNotice(
                        "Edit a reference or find places again. A new search retrieves fresh evidence.",
                      );
                    }}
                  >
                    <ArrowLeft size={14} />
                    Your references
                  </button>
                  <button
                    aria-label="Review answer history"
                    onClick={() => setModal("history")}
                  >
                    <History size={16} />
                    <span>{answers.length}</span>
                  </button>
                </div>
                <div className="result-eyebrow">
                  <span className="live-dot" />
                  {restored
                    ? "RESTORED OBSERVATIONS"
                    : "LIVE QLOO OBSERVATIONS"}
                  <span> / NYC</span>
                </div>
                <h1 className="result-title">
                  A new point
                  <br />
                  of <em>view.</em>
                  <span>↗</span>
                </h1>
                <div className="reference-chips">
                  {evidence.references.map((r, i) => (
                    <span className={`lens-${i}`} key={r.id}>
                      <i />
                      {r.name}
                    </span>
                  ))}
                </div>
                <div className="result-summary">
                  <span>{eligible.length} shared places</span>
                  <span>·</span>
                  <span>{decision?.answered ?? 0} / 3 choices</span>
                  <button onClick={() => setModal("evidence")}>
                    Why these?
                    <Info size={13} />
                  </button>
                </div>
                {decision?.status === "insufficient" ||
                decision?.status === "exhausted" ? (
                  <div className="empty-decision">
                    <h2>
                      {decision.status === "exhausted"
                        ? "A fresh perspective?"
                        : "We need a little more to go on."}
                    </h2>
                    <p>{decision.reason}</p>
                    <button
                      className="text-link"
                      onClick={() => setModal("history")}
                    >
                      Review your choices
                      <ArrowRight size={15} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="shortlist-heading">
                      <span className="eyebrow">YOUR CONSIDERED SHORTLIST</span>
                      <button
                        onClick={() => setModal("balance")}
                        aria-label="Adjust your cultural balance"
                      >
                        <SlidersHorizontal size={15} />
                      </button>
                    </div>
                    <div className="shortlist">
                      {eligible.slice(0, 3).map((r, i) => {
                        const p = evidence.places.find((p) => p.id === r.id)!;
                        return (
                          <button
                            key={r.id}
                            className={`shortlist-card ${selectedPlace?.id === r.id ? "active" : ""}`}
                            onClick={() => setSelected(r.id)}
                          >
                            <span className="rank-number">0{i + 1}</span>
                            <PlaceImage place={p} />
                            <span className="shortlist-card-text">
                              <strong>{p.name}</strong>
                              <small>
                                {p.category ?? "A place in New York"}
                                <span>
                                  {i === 0
                                    ? "Your current first pick"
                                    : `Another perspective`}
                                </span>
                              </small>
                            </span>
                            <ArrowUpRight size={17} />
                          </button>
                        );
                      })}
                    </div>
                    {selectedPlace && (
                      <div className="selected-details">
                        <div className="detail-caption">
                          <span className="eyebrow">
                            {selectedRank < 3
                              ? "A CLOSER LOOK"
                              : "FROM THE SHARED CANDIDATE SET"}
                          </span>
                          <span>
                            {selectedRank >= 0
                              ? `${selectedRank + 1} / ${eligible.length}`
                              : ""}
                          </span>
                        </div>
                        <p>{selectedPlace.description}</p>
                        <div className="address-line">
                          <MapPin size={14} />
                          <span>
                            {selectedPlace.address ??
                              `${selectedPlace.lat.toFixed(4)}, ${selectedPlace.lon.toFixed(4)}`}
                          </span>
                        </div>
                        <div className="place-actions">
                          <a
                            href={directions(selectedPlace)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Get directions
                            <ArrowUpRight size={14} />
                          </a>
                          {selectedPlace.website && (
                            <a
                              href={selectedPlace.website}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Venue website
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                        <p className="venue-note">
                          Check current entry, opening, prices, and
                          accessibility directly.
                        </p>
                      </div>
                    )}
                    {decision?.question && currentPair && showCompare ? (
                      <section
                        className="comparison"
                        aria-labelledby="comparison-title"
                      >
                        <div className="comparison-kicker">
                          <Sparkles size={14} />
                          <span>ONE USEFUL QUESTION</span>
                          <button
                            onClick={() => setShowCompare(false)}
                            aria-label="Collapse comparison"
                          >
                            <ChevronDown size={16} />
                          </button>
                        </div>
                        <h2 id="comparison-title">
                          Which would you rather
                          <br />
                          <em>try for this outing?</em>
                        </h2>
                        <p className="comparison-intro">
                          You don’t need to have been to either. Pick what draws
                          you in.
                        </p>
                        <div className="comparison-pair">
                          {currentPair.map((p, i) => (
                            <button
                              key={p.id}
                              onClick={() => answer(i === 0 ? "a" : "b")}
                              className="comparison-option"
                            >
                              <PlaceImage place={p} />
                              <span className="option-letter">
                                {i === 0 ? "A" : "B"}
                              </span>
                              <strong>{p.name}</strong>
                              <small>
                                {p.description.slice(0, 115)}
                                {p.description.length > 115 ? "…" : ""}
                              </small>
                              <span className="option-choose">
                                I’d try this
                                <ArrowUpRight size={14} />
                              </span>
                            </button>
                          ))}
                        </div>
                        <div className="comparison-alternatives">
                          <button onClick={() => answer("both")}>
                            Both look good
                          </button>
                          <button onClick={() => answer("neither")}>
                            Neither
                          </button>
                          <button onClick={() => answer("skip")}>
                            Not enough info
                          </button>
                        </div>
                      </section>
                    ) : decision?.question ? (
                      <button
                        className="reopen-comparison"
                        onClick={() => setShowCompare(true)}
                      >
                        A comparison could refine this
                        <ArrowUpRight size={15} />
                      </button>
                    ) : (
                      <div className="stop-note">
                        <Check size={16} />
                        <p>
                          {manual
                            ? "You set the balance. Switch back to your answers to resume learning."
                            : decision?.answered === 3
                              ? "Three choices, a clearer direction. Your current shortlist is ready."
                              : decision?.reason}
                        </p>
                      </div>
                    )}
                    <div className="result-actions">
                      <button
                        onClick={() => {
                          setSaved(true);
                          setNotice(
                            storageOk
                              ? "Your current decision is saved on this device."
                              : "Browser storage is unavailable. Export your preferences to keep them.",
                          );
                        }}
                      >
                        <Bookmark size={15} />
                        {saved ? "Saved here" : "Keep this view"}
                      </button>
                      <button onClick={exportBrief}>
                        <Download size={15} />
                        Field notes
                      </button>
                      <button onClick={() => setModal("history")}>
                        <History size={15} />
                        Edit choices
                      </button>
                    </div>
                    <button
                      className="refresh-link"
                      disabled={busy}
                      onClick={() => void findPlaces()}
                    >
                      <RotateCcw size={12} />
                      {busy
                        ? "Refreshing live evidence…"
                        : `Retrieved ${prettyTime(evidence.retrievedAt)} · Refresh evidence`}
                    </button>
                  </>
                )}
              </>
            )}
            {error && (
              <div className="error-message" role="alert">
                <Info size={17} />
                <div>
                  <strong>That connection needs another try.</strong>
                  <p>{error}</p>
                </div>
                <button aria-label="Dismiss error" onClick={() => setError("")}>
                  <X size={14} />
                </button>
              </div>
            )}
            {notice && (
              <div className="notice-message" role="status">
                <Check size={14} />
                <p>{notice}</p>
                <button
                  aria-label="Dismiss notification"
                  onClick={() => setNotice("")}
                >
                  <X size={13} />
                </button>
              </div>
            )}
            {!storageOk && (
              <p className="storage-warning">
                Local storage is unavailable in this browser. Export preferences
                to keep your choices.
              </p>
            )}
            <footer className="panel-footer">
              <span>
                POWERED BY{" "}
                <a
                  href="https://www.qloo.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Qloo
                </a>
              </span>
              <button onClick={() => setModal("about")}>
                Private by design
                <ArrowUpRight size={11} />
              </button>
            </footer>
          </div>
        </section>
        <section className="map-panel" aria-label="Explore your places">
          <MapView
            evidence={evidence}
            decision={decision}
            selected={selectedPlace?.id ?? null}
            onSelect={setSelected}
            view={view}
          />
          <div className="map-topbar">
            <span className="map-location">
              <MapPin size={13} />
              New York City<span className="area-label">EDITION 001</span>
            </span>
            {evidence && (
              <div className="map-view-switch">
                <button
                  aria-pressed={view === "city"}
                  onClick={() => setView("city")}
                >
                  <Map size={14} />
                  City map
                </button>
                <button
                  aria-pressed={view === "taste"}
                  onClick={() => setView("taste")}
                >
                  <Layers3 size={14} />
                  Taste map
                </button>
              </div>
            )}
          </div>
          {evidence && decision && (
            <div className="perspective-card">
              <div>
                <span className="eyebrow">YOUR CURRENT PERSPECTIVE</span>
                <button
                  aria-label="How your cultural balance works"
                  onClick={() => setModal("balance")}
                >
                  <ArrowUpRight size={18} />
                </button>
              </div>
              <div className="balance-bar">
                {decision.weights.map((w, i) => (
                  <span
                    key={i}
                    className={`lens-fill-${i}`}
                    style={{ width: `${w * 100}%` }}
                  />
                ))}
              </div>
              <div className="balance-labels">
                {evidence.references.map((r, i) => (
                  <span key={r.id}>
                    <i className={`lens-fill-${i}`} />
                    <span>{r.name}</span>
                    <strong>{Math.round(decision.weights[i] * 100)}%</strong>
                  </span>
                ))}
              </div>
              <span className="balance-disclaimer">
                {manual
                  ? "Your explicit balance"
                  : "Modeled emphasis from your answers"}{" "}
                · not a taste probability
              </span>
            </div>
          )}
          {!evidence && (
            <div className="map-bottom-caption">
              <span>
                ONE CITY.
                <br />
                <em>Your point of view.</em>
              </span>
              <button
                aria-label="Read how PARALLAX works"
                onClick={() => setModal("about")}
              >
                <ArrowUpRight size={24} />
              </button>
            </div>
          )}
          {evidence && selectedPlace && (
            <div className="map-place-label">
              <span>
                {selectedRank >= 0
                  ? String(selectedRank + 1).padStart(2, "0")
                  : "—"}
              </span>
              <div>
                <strong>{selectedPlace.name}</strong>
                <small>{selectedPlace.category ?? "New York City"}</small>
              </div>
              <a
                href={directions(selectedPlace)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Directions to ${selectedPlace.name}`}
              >
                <ArrowUpRight size={18} />
              </a>
            </div>
          )}
        </section>
      </main>
      <input
        type="file"
        tabIndex={-1}
        accept="application/json,.json"
        ref={importInput}
        className="sr-only"
        aria-label="Import PARALLAX preferences"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = "";
        }}
      />
      {modal && (
        <div
          className="modal-scrim"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div
            className={`modal ${modal === "history" ? "history-modal" : ""}`}
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="modal-close"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={21} />
            </button>
            {modal === "about" && (
              <>
                <span className="eyebrow">A DIFFERENT POINT OF VIEW</span>
                <h2 id="modal-title">
                  Culture opens
                  <br />
                  <em>another door.</em>
                </h2>
                <p>
                  PARALLAX helps you choose one place to try in New York through
                  two or three cultural references you know. Qloo brings the
                  cultural connections; your explicit choices give the decision
                  direction.
                </p>
                <div className="how-steps">
                  <div>
                    <span>01</span>
                    <div>
                      <h3>Bring your culture.</h3>
                      <p>
                        Confirm an artist or film identity. Two references
                        create two different lenses on the same city.
                      </p>
                    </div>
                  </div>
                  <div>
                    <span>02</span>
                    <div>
                      <h3>Find the overlap.</h3>
                      <p>
                        Qloo discovers places, then ranks the same shortlist
                        through each reference. Coordinates must fall inside the
                        supported New York search bounds.
                      </p>
                    </div>
                  </div>
                  <div>
                    <span>03</span>
                    <div>
                      <h3>Change the perspective.</h3>
                      <p>
                        If a useful comparison exists, choose what you’d rather
                        try. Up to three relative choices refine a small,
                        explicit model. You can skip, veto, correct, and remove.
                      </p>
                    </div>
                  </div>
                </div>
                <h3>Your answers stay yours.</h3>
                <p>
                  Browser choices are computed and stored on this device. Live
                  searches send only cultural reference identities to Qloo. The
                  remote agent tool sends the answers supplied in that
                  invocation; they are processed without a remote profile store.
                  Temporary evidence expires after 30 minutes.
                </p>
                <p>
                  Qloo cultural associations do not establish personal
                  enjoyment, current entry conditions, opening times, prices,
                  accessibility, or safety. The first edition supports a bounded
                  New York area.
                </p>
                <div className="modal-utilities">
                  <button
                    onClick={() => {
                      setModal(null);
                      importInput.current?.click();
                    }}
                  >
                    <Upload size={15} />
                    Import preferences
                  </button>
                  <button onClick={() => void clearAll()}>
                    <Trash2 size={15} />
                    Remove app data
                  </button>
                </div>
                <p className="fine-print">
                  Removal covers this app’s local state and its reachable
                  temporary evidence handle. Earlier exports, screenshots,
                  external-agent memory, provider logs, and backups are outside
                  its control. Maps: OpenFreeMap, OpenMapTiles, and
                  OpenStreetMap contributors. Typeface files are bundled under
                  their open font licenses.
                </p>
                <a
                  className="text-link"
                  href="https://github.com/kathir-iTech/parallax"
                  target="_blank"
                  rel="noreferrer"
                >
                  Source and methodology
                  <ArrowUpRight size={14} />
                </a>
              </>
            )}
            {modal === "history" && (
              <>
                <span className="eyebrow">YOUR CHOICES, YOUR CONTROL</span>
                <h2 id="modal-title">
                  A considered
                  <br />
                  <em>change of mind.</em>
                </h2>
                <p>
                  Change or remove an answer. The model rebuilds from a clean
                  prior and exactly the answers you retain.
                </p>
                {answers.length ? (
                  <div className="history-list">
                    {answers.map((a, i) => (
                      <div key={a.id} className="history-item">
                        <span className="eyebrow">COMPARISON {i + 1}</span>
                        <strong>
                          {evidence?.places.find((p) => p.id === a.a)?.name ??
                            "First previously compared place"}{" "}
                          <em>×</em>{" "}
                          {evidence?.places.find((p) => p.id === a.b)?.name ??
                            "Second previously compared place"}
                        </strong>
                        <div>
                          <label className="sr-only" htmlFor={`answer-${a.id}`}>
                            Change comparison {i + 1}
                          </label>
                          <select
                            id={`answer-${a.id}`}
                            value={a.choice}
                            onChange={(e) =>
                              editAnswer(a.id, e.target.value as Choice)
                            }
                          >
                            {Object.entries(labels).map(([value, label]) => (
                              <option value={value} key={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <button
                            aria-label={`Remove comparison ${i + 1}`}
                            onClick={() => editAnswer(a.id, null)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="history-empty">
                    <History size={24} />
                    <p>
                      No answers yet. Your first comparison will appear here.
                    </p>
                  </div>
                )}
                <div className="modal-utilities">
                  <button disabled={refs.length < 2} onClick={exportProfile}>
                    <Download size={15} />
                    Export preferences
                  </button>
                  <button
                    onClick={() => {
                      setModal(null);
                      importInput.current?.click();
                    }}
                  >
                    <Upload size={15} />
                    Import preferences
                  </button>
                  <button onClick={() => void clearAll()}>
                    <Trash2 size={15} />
                    Remove app data
                  </button>
                </div>
                <p className="fine-print">
                  Preference exports include cultural identities and your
                  explicit answers. They do not embed provider descriptions,
                  images, credentials, or a fresh-result claim.
                </p>
              </>
            )}
            {modal === "evidence" && evidence && decision && (
              <>
                <span className="eyebrow">FOLLOW THE CONNECTION</span>
                <h2 id="modal-title">
                  Why this
                  <br />
                  <em>point of view?</em>
                </h2>
                <p>
                  Qloo supplied {evidence.coverage.discovered} distinct
                  candidates across your references.{" "}
                  {evidence.coverage.admitted} passed admission into the
                  balanced shortlist; {evidence.coverage.common} had ranking
                  evidence under every lens.
                </p>
                <div className="evidence-source">
                  <span className="live-dot" />
                  <div>
                    <strong>
                      {restored
                        ? "Previously retrieved Qloo observations"
                        : "Qloo Taste AI · live retrieval"}
                    </strong>
                    <small>
                      {new Date(evidence.retrievedAt).toLocaleString()} ·{" "}
                      {evidence.workflow}
                    </small>
                  </div>
                </div>
                {selectedPlace && selectedFeature && (
                  <>
                    <h3>{selectedPlace.name}</h3>
                    <div className="feature-rows">
                      {evidence.references.map((r, i) => (
                        <div key={r.id}>
                          <span>
                            <i className={`lens-fill-${i}`} />
                            {r.name}
                          </span>
                          <strong>
                            #{evidence.ranks[i].indexOf(selectedPlace.id) + 1}{" "}
                            <small>of {evidence.places.length}</small>
                          </strong>
                        </div>
                      ))}
                    </div>
                    <p>
                      These are positions within this candidate set. PARALLAX
                      transforms ordinal positions into its own utility
                      features; they are not provider probabilities.
                    </p>
                    <p>
                      The direct combined-signal Qloo baseline placed this
                      option at{" "}
                      {selectedFeature.directRank
                        ? `#${selectedFeature.directRank}`
                        : "an unreturned position"}
                      . Your current model places it at #{selectedRank + 1}
                      {manual
                        ? " using your explicit weights"
                        : ` after ${decision.answered} relative choices`}
                      .
                    </p>
                  </>
                )}
                <details>
                  <summary>Decision policy and boundaries</summary>
                  <p>
                    Model {MODEL}: a uniform prior over{" "}
                    {decision.posterior.length} simplex hypotheses, 0.1 grid,
                    logistic choice noise {NOISE}. Select the comparison with
                    greatest expected reduction in modeled decision regret. Ask
                    only above the declared {QUESTION_COST} utility threshold.
                    Three answered comparisons maximum; two consecutive skips
                    stop.
                  </p>
                  <p>
                    Current modeled regret: {decision.regret.toFixed(4)}. This
                    is an internal quantity under ordinal-feature assumptions.
                    It is not measured human loss or confidence in enjoyment.
                    Missing rankings are excluded from the common subset, never
                    converted into dislikes.
                  </p>
                  <p>{decision.reason}</p>
                </details>
                <p className="fine-print">
                  Correction and removal rebuild the finite model. Cultural fit
                  cannot certify the venue facts you should verify before
                  visiting.
                </p>
              </>
            )}
            {modal === "balance" && evidence && decision && (
              <>
                <span className="eyebrow">ONE CITY, SEVERAL LENSES</span>
                <h2 id="modal-title">
                  Shift your
                  <br />
                  <em>perspective.</em>
                </h2>
                <p>
                  Try an explicit cultural balance in 10% steps. This is a
                  transparent alternative to learning from comparisons. Your
                  answers remain available when you switch back.
                </p>
                <div className="weight-controls">
                  {evidence.references.map((r, i) => (
                    <label key={r.id}>
                      <span>
                        <i className={`lens-fill-${i}`} />
                        {r.name}
                        <strong>
                          {Math.round(decision.weights[i] * 100)}%
                        </strong>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={decision.weights[i]}
                        aria-label={`${r.name} weight`}
                        onChange={(e) => {
                          const value = Number(e.target.value),
                            w = [...decision.weights],
                            otherTotal = w.reduce(
                              (s, x, j) => (j === i ? s : s + x),
                              0,
                            );
                          setManual(
                            w.map((x, j) =>
                              j === i
                                ? value
                                : otherTotal > 0
                                  ? (x / otherTotal) * (1 - value)
                                  : (1 - value) / (w.length - 1),
                            ),
                          );
                          setSelected(null);
                        }}
                      />
                    </label>
                  ))}
                </div>
                <button
                  className="primary-button"
                  onClick={() => {
                    setManual(null);
                    setNotice(
                      "Your retained answers determine the balance again.",
                    );
                    setModal(null);
                  }}
                >
                  Return to my answers
                  <ArrowRight size={17} />
                </button>
                <p className="fine-print">
                  Percentages describe model emphasis on cultural reference
                  rankings. They are not percentages of your identity or Qloo
                  affinity probabilities.
                </p>
              </>
            )}
            {modal === "agent" && (
              <>
                <span className="eyebrow">
                  THE SAME DECISION, ANOTHER SURFACE
                </span>
                <h2 id="modal-title">
                  Built to work
                  <br />
                  <em>with your agent.</em>
                </h2>
                <p>
                  The <code>parallax_advise</code> MCP tool uses this same
                  evidence and decision engine. It can resolve a reference,
                  prepare a shortlist, and return a next comparison or
                  considered recommendation.
                </p>
                <div className="agent-flow">
                  <span>YOUR AGENT</span>
                  <ArrowRight size={16} />
                  <span>PARALLAX TOOL</span>
                  <ArrowRight size={16} />
                  <span>QLOO</span>
                </div>
                <pre>
                  <code>{`git clone https://github.com/kathir-iTech/parallax\ncd parallax\nnpm ci\nnpm run mcp`}</code>
                </pre>
                <p>
                  The documented bridge uses local stdio and the public HTTPS
                  backend. No paid runtime model is required by the tool. Your
                  chosen host may have its own model charges.
                </p>
                <p>
                  A real protocol-client round trip is an integration check, not
                  a claim that a language model autonomously used the tool.
                </p>
                <a
                  className="text-link"
                  href="https://github.com/kathir-iTech/parallax/blob/main/docs/AGENT.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  Connection and schema guide
                  <ArrowUpRight size={15} />
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
