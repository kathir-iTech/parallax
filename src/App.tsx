import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
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
import {
  AnimatedShortlist,
  CityArtwork,
  PhotoCredit,
  PlaceImage,
} from "./Experience.tsx";
import { venuePhotos } from "./photos.ts";
const MapView = lazy(() =>
  import("./MapView.tsx").then((module) => ({ default: module.MapView })),
);
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
  const [modal, setModalState] = useState<
      "about" | "history" | "evidence" | "agent" | "balance" | "photos" | null
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
  const [mapOpen, setMapOpen] = useState(false),
    [mapVisited, setMapVisited] = useState(false);
  const scrollTo = (id: string) =>
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      }),
    );
  const pending = useRef<AbortController | null>(null),
    generation = useRef(0),
    importInput = useRef<HTMLInputElement>(null),
    modalRef = useRef<HTMLDivElement>(null),
    modalPrevious = useRef<HTMLElement | null>(null);
  function setModal(next: typeof modal) {
    if (next) modalPrevious.current = document.activeElement as HTMLElement;
    setModalState(next);
  }
  const refs = references.filter((r): r is Reference => r !== null);
  const decision = useMemo(
    () =>
      evidence
        ? advise(evidence, answers, manual ? { manualWeights: manual } : {})
        : null,
    [evidence, answers, manual],
  );
  const initialDecision = useMemo(
    () => (evidence ? advise(evidence, []) : null),
    [evidence],
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
              advise(
                p.evidence,
                p.answers ?? [],
                p.manualWeights ? { manualWeights: p.manualWeights } : {},
              );
              setEvidence(p.evidence);
              setManual(p.manualWeights ?? null);
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
          ...(manual ? { manualWeights: manual } : {}),
        }
      : null;
    void saveProfile(profile).catch(() => setStorageOk(false));
  }, [references, answers, evidence, revision, hydrated, restored, manual]);
  useEffect(() => {
    if (!modal) return;
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
      if (modalPrevious.current?.isConnected)
        modalPrevious.current.focus({ preventScroll: true });
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
    setMapOpen(false);
    setMapVisited(false);
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
      setMapOpen(false);
      setMapVisited(false);
      scrollTo("workspace");
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
    requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>(
        ".question-title, #decision-title",
      );
      heading?.focus({ preventScroll: true });
    });
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
          ...(manual ? { manualWeights: manual } : {}),
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
      setManual(data.manualWeights ?? null);
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
  function openMap() {
    setMapVisited(true);
    setMapOpen(true);
    scrollTo("place-explorer");
  }
  function pickPlace(id: string) {
    setSelected(id);
    if (!mapOpen) {
      setShowCompare(false);
      scrollTo("decision-content");
    }
  }
  const comparing = Boolean(decision?.question && currentPair && showCompare);
  const baselineRank = selectedPlace
    ? (initialDecision?.ranking.findIndex((r) => r.id === selectedPlace.id) ??
        -1) + 1
    : 0;
  const leadingChanged = initialDecision?.ranking[0]?.id !== top?.id;
  const selectedLens =
    selectedFeature?.features.reduce(
      (best, value, i, all) => (value > all[best] ? i : best),
      0,
    ) ?? 0;
  return (
    <div className={`app-shell ${evidence ? "result-shell" : "entry-shell"}`}>
      <a className="skip-link" href="#workspace">
        Skip to the experience
      </a>
      <header className="site-header" inert={Boolean(modal)}>
        <a className="brand" href="/" aria-label="PARALLAX home">
          <svg viewBox="0 0 38 36" aria-hidden="true">
            <path d="M4 31V5h15a9 9 0 0 1 0 18H4m12 8V5h12a9 9 0 0 1 0 18H16" />
          </svg>
          <span>
            parallax<span className="brand-dot">↗</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <button onClick={() => setModal("about")}>The idea</button>
          <button onClick={() => setModal("agent")}>
            <Code2 size={17} /> For agents
          </button>
        </nav>
        <span className="header-location">
          <MapPin size={17} /> New York City
        </span>
      </header>
      <main
        id="workspace"
        tabIndex={-1}
        inert={Boolean(modal)}
        className={`workspace ${evidence ? "has-results" : ""}`}
      >
        {busy ? (
          <section
            className="discovery-stage"
            aria-labelledby="discovery-title"
          >
            <div className="discovery-art" aria-hidden="true">
              <span className="discovery-disc">
                <span />
              </span>
              <span className="discovery-cross">×</span>
              <span className="discovery-frame">
                <span />
                <span />
                <span />
              </span>
            </div>
            <p className="section-label">
              Your references. A whole new connection.
            </p>
            <h1 id="discovery-title">
              Finding your
              <br />
              <em>kind of place.</em>
            </h1>
            <div className="reference-chips">
              {refs.map((r, i) => (
                <span className={`lens-${i}`} key={r.id}>
                  {r.name}
                </span>
              ))}
            </div>
            <div className="loading-note" role="status">
              <span className="loading-track" />
              <p>
                Qloo is discovering New York places and comparing them through
                your references. Your shortlist appears when the evidence is
                ready.
              </p>
            </div>
            <button
              className="text-link"
              onClick={() => {
                generation.current++;
                pending.current?.abort();
                setBusy(false);
                setNotice(
                  "Search cancelled. A provider request already in progress may still count toward the allowance.",
                );
              }}
            >
              Cancel search <X size={17} />
            </button>
          </section>
        ) : !evidence ? (
          <>
            <section className="entry-hero" aria-labelledby="entry-title">
              <div className="hero-copy">
                <p className="section-label">
                  <span className="live-dot" /> Culture takes you places.
                </p>
                <h1 id="entry-title">
                  Go somewhere
                  <br />
                  that feels
                  <br />
                  <em>like you.</em>
                  <span className="hero-arrow" aria-hidden="true">
                    ↗
                  </span>
                </h1>
                <p className="hero-description">
                  Find a New York place through the music and films you love. A
                  few choices make it yours.
                </p>
                <a className="hero-start" href="#your-references">
                  Find your connection <ArrowDown size={20} />
                </a>
              </div>
              <CityArtwork />
            </section>
            <section
              className="reference-workspace"
              id="your-references"
              aria-labelledby="references-title"
            >
              <div className="section-heading">
                <div>
                  <p className="section-label">Start with your world</p>
                  <h2 id="references-title">What stays with you?</h2>
                </div>
                <p>
                  An artist on repeat. A film you think about.
                  <br /> Bring two. We’ll find the connection.
                </p>
              </div>
              <div className={`reference-stack count-${references.length}`}>
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
              <div className="reference-bottom">
                <div>
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
                      <Plus size={18} /> Add a third reference
                    </button>
                  )}
                  <p>Choose a search result to confirm each identity.</p>
                </div>
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
                  Find my places <ArrowUpRight size={23} />
                </button>
              </div>
              <div className="example-block">
                <span>Try a pairing</span>
                <button
                  disabled={busy || exampleBusy}
                  onClick={() => void example(1)}
                >
                  {exampleBusy ? (
                    <span className="spinner" />
                  ) : (
                    <>
                      <span className="example-dot dot-purple" />
                      Radiohead <em>×</em> Grand Budapest{" "}
                      <ArrowUpRight size={17} />
                    </>
                  )}
                </button>
                <button
                  disabled={busy || exampleBusy}
                  onClick={() => void example(2)}
                >
                  <span className="example-dot dot-coral" />
                  Beyoncé <em>×</em> Spirited Away <ArrowUpRight size={17} />
                </button>
              </div>
            </section>
            <section className="how-strip" aria-label="How discovery works">
              <div>
                <span>1</span>
                <p>
                  <strong>Bring your culture.</strong>Choose music and films you
                  love.
                </p>
              </div>
              <ArrowRight size={23} />
              <div>
                <span>2</span>
                <p>
                  <strong>Follow your curiosity.</strong>Compare places when a
                  choice helps.
                </p>
              </div>
              <ArrowRight size={23} />
              <div>
                <span>3</span>
                <p>
                  <strong>Find your next place.</strong>See what changed and
                  why.
                </p>
              </div>
            </section>
          </>
        ) : (
          decision && (
            <>
              <div className="journey-bar">
                <button
                  className="back-link"
                  onClick={() => {
                    setEvidence(null);
                    setSelected(null);
                    setManual(null);
                    setMapOpen(false);
                    setMapVisited(false);
                    setNotice("");
                    scrollTo("your-references");
                  }}
                >
                  <ArrowLeft size={18} /> Your references
                </button>
                <div className="reference-chips">
                  {evidence.references.map((r, i) => (
                    <span className={`lens-${i}`} key={r.id}>
                      {r.name}
                    </span>
                  ))}
                </div>
                <button
                  className="history-link"
                  onClick={() => setModal("history")}
                  aria-label="Review answer history"
                >
                  <History size={18} />
                  <span>
                    {answers.length
                      ? `${answers.length} ${answers.length === 1 ? "choice" : "choices"}`
                      : "Your choices"}
                  </span>
                </button>
              </div>
              <div className="result-eyebrow">
                <span className="live-dot" />
                {restored ? "Restored observations" : "Live Qloo observations"}
                <span> · New York City</span>
              </div>
              <div
                className="decision-grid"
                id="decision-content"
                hidden={mapOpen}
              >
                <section
                  className="decision-main"
                  aria-label={
                    comparing
                      ? "Refine your places"
                      : "Your place recommendation"
                  }
                >
                  {decision.status === "insufficient" ||
                  decision.status === "exhausted" ? (
                    <div className="empty-decision">
                      <h1 id="decision-title" tabIndex={-1}>
                        Let’s change
                        <br />
                        <em>the perspective.</em>
                      </h1>
                      <p>{decision.reason}</p>
                      <button
                        className="primary-button"
                        onClick={() => setModal("history")}
                      >
                        Review your choices <ArrowRight size={19} />
                      </button>
                    </div>
                  ) : comparing && currentPair ? (
                    <section
                      className="comparison"
                      aria-labelledby="comparison-title"
                    >
                      <div className="comparison-heading">
                        <div>
                          <p className="section-label">
                            Make it a little more you
                          </p>
                          <h1
                            id="comparison-title"
                            className="question-title"
                            tabIndex={-1}
                          >
                            Where <em>next?</em>
                          </h1>
                        </div>
                        <span className="choice-count">
                          {decision.answered} / 3 choices
                        </span>
                      </div>
                      <p className="comparison-intro">
                        Which would you rather try? Choose what draws you in.
                      </p>
                      <div
                        className="comparison-pair"
                        key={`${decision.question!.a}-${decision.question!.b}`}
                      >
                        {currentPair.map((p, i) => (
                          <button
                            key={p.id}
                            onClick={() => answer(i === 0 ? "a" : "b")}
                            className="comparison-option"
                          >
                            <div className="option-image">
                              <PlaceImage
                                key={p.id}
                                place={p}
                                use="comparison"
                              />
                              <span className="option-letter">
                                {i === 0 ? "A" : "B"}
                              </span>
                              <span className="option-arrow">
                                <ArrowUpRight size={25} />
                              </span>
                            </div>
                            <div className="option-copy">
                              <span className="place-category">
                                {p.category ?? "New York place"}
                              </span>
                              <strong>{p.name}</strong>
                              <p>
                                {p.description.slice(0, 175)}
                                {p.description.length > 175 ? "…" : ""}
                              </p>
                              <span className="option-choose">
                                I’d try this <ArrowRight size={18} />
                              </span>
                            </div>
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
                      <div className="comparison-photo-credits">
                        {currentPair.map((p) => (
                          <PhotoCredit key={p.id} place={p} />
                        ))}
                      </div>
                      <div className="comparison-foot">
                        <p>
                          We ask only when a comparison could help your
                          decision.
                        </p>
                        <button
                          className="text-link"
                          onClick={() => {
                            setShowCompare(false);
                            scrollTo("decision-content");
                          }}
                        >
                          See my places <ArrowRight size={18} />
                        </button>
                      </div>
                    </section>
                  ) : (
                    selectedPlace && (
                      <section
                        className="place-result"
                        aria-labelledby="decision-title"
                      >
                        <div className="result-heading">
                          <div>
                            <p className="section-label">
                              {selectedRank === 0
                                ? "Leading your shortlist"
                                : "Another point of view"}
                            </p>
                            <h1 id="decision-title" tabIndex={-1}>
                              {selectedPlace.name}
                            </h1>
                          </div>
                          <span className="result-rank">
                            {String(selectedRank + 1).padStart(2, "0")}
                            <span> / {eligible.length}</span>
                          </span>
                        </div>
                        <PlaceImage
                          key={selectedPlace.id}
                          place={selectedPlace}
                          className="result-photo"
                          use="result"
                        />
                        <PhotoCredit place={selectedPlace} />
                        <div className="place-detail-heading">
                          <span className="place-category">
                            {selectedPlace.category ?? "New York place"}
                          </span>
                          <button className="text-link" onClick={openMap}>
                            <Map size={17} /> Explore on map
                          </button>
                        </div>
                        <p className="place-description">
                          {selectedPlace.description}
                        </p>
                        <div className="address-line">
                          <MapPin size={19} />
                          <span>
                            {selectedPlace.address ??
                              `${selectedPlace.lat.toFixed(4)}, ${selectedPlace.lon.toFixed(4)}`}
                          </span>
                        </div>
                        <div className="place-actions">
                          <a
                            className="primary-button"
                            href={directions(selectedPlace)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Get directions <ArrowUpRight size={20} />
                          </a>
                          {selectedPlace.website && (
                            <a
                              className="secondary-button"
                              href={selectedPlace.website}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Venue website <ExternalLink size={17} />
                            </a>
                          )}
                        </div>
                        <p className="venue-note">
                          Check current opening, entry, prices, and
                          accessibility with the venue.
                        </p>
                        <div className="why-place">
                          <div className="why-icon">
                            <Layers3 size={25} />
                          </div>
                          <div>
                            <h2>Why it’s in your world.</h2>
                            <p>
                              {evidence.references[selectedLens].name} puts this
                              place at #
                              {evidence.ranks[selectedLens].indexOf(
                                selectedPlace.id,
                              ) + 1}{" "}
                              within your {evidence.places.length}-place
                              shortlist.{" "}
                              {manual
                                ? "Your explicit balance determines its position."
                                : decision.answered
                                  ? "Your comparison answers help determine its current position."
                                  : "Your references currently have equal emphasis."}
                            </p>
                            <button
                              className="text-link"
                              onClick={() => setModal("evidence")}
                            >
                              Follow the evidence <ArrowUpRight size={16} />
                            </button>
                          </div>
                        </div>
                        {decision.question ? (
                          <button
                            className="refine-button"
                            onClick={() => {
                              setShowCompare(true);
                              scrollTo("decision-content");
                            }}
                          >
                            <Sparkles size={20} />
                            <span>
                              Still curious?
                              <strong>
                                A comparison could refine your choice.
                              </strong>
                            </span>
                            <ArrowRight size={22} />
                          </button>
                        ) : (
                          <div className="stop-note">
                            <Check size={20} />
                            <p>
                              {manual
                                ? "Your explicit balance is in charge. Return to your answers to resume learning."
                                : decision.answered === 3
                                  ? "Three comparisons complete. Your considered shortlist is ready."
                                  : answers.length >= 2 &&
                                      answers
                                        .slice(-2)
                                        .every((a) => a.choice === "skip")
                                    ? "You skipped two comparisons. Here’s your available shortlist; your relative preference remains uncertain."
                                    : decision.answered > 0
                                      ? "Your shortlist is ready. No further comparison is needed under this decision policy."
                                      : "Your shortlist is ready. No further comparison clears the benefit threshold under this model."}
                              <button
                                className="text-link"
                                onClick={() => setModal("evidence")}
                              >
                                How was this decided? <ArrowUpRight size={15} />
                              </button>
                            </p>
                          </div>
                        )}
                      </section>
                    )
                  )}
                </section>
                <aside
                  className="decision-sidebar"
                  aria-label="Your developing shortlist"
                >
                  <div className="sidebar-heading">
                    <div>
                      <p className="section-label">Taking shape</p>
                      <h2>Your places.</h2>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Adjust your cultural balance"
                      onClick={() => setModal("balance")}
                    >
                      <SlidersHorizontal size={21} />
                    </button>
                  </div>
                  <AnimatedShortlist
                    evidence={evidence}
                    decision={decision}
                    selected={selectedPlace?.id ?? null}
                    onSelect={pickPlace}
                  />
                  {answers.length > 0 && top && (
                    <div
                      className="decision-change"
                      key={`${revision}-${manual ? "manual" : "answers"}`}
                    >
                      <span className="change-icon">↗</span>
                      <div>
                        <strong>
                          {manual
                            ? "You set the direction."
                            : decision.vetoes.length > 0
                              ? "Your choices shape the list."
                              : decision.answered === 0
                                ? "No relative preference inferred."
                                : leadingChanged
                                  ? "Your first pick changed."
                                  : "Your first pick held its place."}
                        </strong>
                        <p>
                          {manual
                            ? "This order uses your explicit balance."
                            : decision.vetoes.length > 0
                              ? `${decision.vetoes.length} places ruled out. You can undo any choice.`
                              : decision.answered === 0
                                ? "Both and skip keep the relative balance unchanged."
                                : leadingChanged
                                  ? `${evidence.places.find((p) => p.id === top.id)?.name} now leads after your comparisons.`
                                  : "Your comparisons refined the balance. The leading place stayed the same."}
                        </p>
                        <button
                          className="text-link"
                          onClick={() => setModal("history")}
                        >
                          Review choices <History size={15} />
                        </button>
                      </div>
                    </div>
                  )}
                  <details className="before-after">
                    <summary>
                      What changed? <ArrowDown size={17} />
                    </summary>
                    <p>
                      Initial equal emphasis →{" "}
                      {manual
                        ? "your explicit balance"
                        : "your current decision"}
                    </p>
                    {eligible.slice(0, 3).map((r, i) => {
                      const before =
                        (initialDecision?.ranking.findIndex(
                          (p) => p.id === r.id,
                        ) ?? -1) + 1;
                      return (
                        <div key={r.id}>
                          <span>
                            {evidence.places.find((p) => p.id === r.id)?.name}
                          </span>
                          <strong>
                            {before || "—"} <ArrowRight size={14} /> {i + 1}
                          </strong>
                        </div>
                      );
                    })}
                    <p>
                      Positions within this shortlist, not enjoyment
                      probabilities.
                    </p>
                  </details>
                  <button className="map-launch" onClick={openMap}>
                    <span className="mini-map" aria-hidden="true">
                      <MapPin size={24} />
                    </span>
                    <span>
                      <strong>Put it on the map.</strong>
                      <span>Explore all {eligible.length} places</span>
                    </span>
                    <ArrowUpRight size={21} />
                  </button>
                  <div className="result-actions">
                    <button
                      onClick={() => {
                        setSaved(storageOk);
                        setNotice(
                          storageOk
                            ? "Your decision is saved on this device."
                            : "Browser storage is unavailable. Export your preferences to keep them.",
                        );
                      }}
                    >
                      <Bookmark size={18} />
                      {saved && storageOk
                        ? "Saved here"
                        : "Save on this device"}
                    </button>
                    <button onClick={exportBrief}>
                      <Download size={18} />
                      Field notes
                    </button>
                    <button onClick={() => setModal("history")}>
                      <History size={18} />
                      Edit choices
                    </button>
                    <button onClick={() => setModal("evidence")}>
                      <Info size={18} />
                      Why these places?
                    </button>
                  </div>
                  <button
                    className="refresh-link"
                    onClick={() => void findPlaces()}
                  >
                    <RotateCcw size={15} />
                    Retrieved {prettyTime(evidence.retrievedAt)} · Refresh
                  </button>
                </aside>
              </div>
              {mapVisited && (
                <section
                  className="place-explorer"
                  id="place-explorer"
                  hidden={!mapOpen}
                  aria-label="Explore your places"
                >
                  <h1 className="sr-only">Explore your New York places</h1>
                  <div className="explorer-heading">
                    <button
                      className="back-link"
                      onClick={() => {
                        setMapOpen(false);
                        scrollTo("decision-content");
                      }}
                    >
                      <ArrowLeft size={18} /> Back to your places
                    </button>
                    <div className="map-view-switch">
                      <button
                        aria-pressed={view === "city"}
                        onClick={() => setView("city")}
                      >
                        <Map size={17} /> City map
                      </button>
                      <button
                        aria-pressed={view === "taste"}
                        onClick={() => setView("taste")}
                      >
                        <Layers3 size={17} /> Connections
                      </button>
                    </div>
                  </div>
                  <div className="explorer-grid">
                    <Suspense
                      fallback={
                        <div className="map-status" role="status">
                          Opening your map…
                        </div>
                      }
                    >
                      <MapView
                        evidence={evidence}
                        decision={decision}
                        selected={selectedPlace?.id ?? null}
                        onSelect={setSelected}
                        view={view}
                        active={mapOpen}
                      />
                    </Suspense>
                    <aside className="map-place-details">
                      {selectedPlace && (
                        <>
                          <PlaceImage
                            key={selectedPlace.id}
                            place={selectedPlace}
                            use="map"
                          />
                          <PhotoCredit place={selectedPlace} />
                          <span className="place-category">
                            {selectedPlace.category ?? "New York place"}
                          </span>
                          <h2>{selectedPlace.name}</h2>
                          <p>{selectedPlace.description}</p>
                          <div className="address-line">
                            <MapPin size={17} />
                            <span>
                              {selectedPlace.address ??
                                "Coordinates available in directions"}
                            </span>
                          </div>
                          <a
                            className="primary-button"
                            href={directions(selectedPlace)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Get directions <ArrowUpRight size={18} />
                          </a>
                        </>
                      )}
                      <details className="all-places" open>
                        <summary>All {eligible.length} places</summary>
                        <div>
                          {eligible.map((r, i) => (
                            <button
                              key={r.id}
                              aria-pressed={selectedPlace?.id === r.id}
                              onClick={() => setSelected(r.id)}
                            >
                              <span>{i + 1}</span>
                              {evidence.places.find((p) => p.id === r.id)?.name}
                              <ArrowUpRight size={16} />
                            </button>
                          ))}
                        </div>
                      </details>
                    </aside>
                  </div>
                </section>
              )}
              {selectedPlace && !comparing && baselineRank > 0 && (
                <span className="sr-only">
                  Initial equal-emphasis rank {baselineRank}; current rank{" "}
                  {selectedRank + 1}.
                </span>
              )}
            </>
          )
        )}
        <div className="feedback-area">
          {error && (
            <div className="error-message" role="alert">
              <Info size={20} />
              <div>
                <strong>That connection needs another try.</strong>
                <p>{error}</p>
              </div>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice-message" role="status">
              <Check size={19} />
              <p>{notice}</p>
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {!storageOk && (
            <p className="storage-warning">
              Local storage is unavailable. Export your preferences to keep your
              choices.
            </p>
          )}
        </div>
        <footer className="site-footer">
          <a className="footer-wordmark" href="/">
            parallax↗
          </a>
          <p>
            Cultural connections by{" "}
            <a href="https://www.qloo.com/" target="_blank" rel="noreferrer">
              Qloo
            </a>
            . Direction by you.
          </p>
          <div>
            <button onClick={() => setModal("about")}>
              How it works & privacy
            </button>
            <button onClick={() => setModal("photos")}>Photography</button>
            <a
              href="https://github.com/kathir-iTech/parallax"
              target="_blank"
              rel="noreferrer"
            >
              Source <ArrowUpRight size={15} />
            </a>
          </div>
        </footer>
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
            {modal === "photos" && (
              <>
                <span className="eyebrow">THE CITY, THROUGH THEIR LENS</span>
                <h2 id="modal-title">A closer look.</h2>
                <p>
                  Real photographs of real places, independently matched to
                  venue identities. Photography illustrates the location; Qloo
                  powers the cultural connections.
                </p>
                <p>
                  Photographs may show earlier appearances. Cropped and resized
                  editions retain the licenses below. If we haven’t verified a
                  photograph, we show a placeholder.
                </p>
                <div className="photography-list">
                  {venuePhotos.map((photo) => (
                    <article key={photo.placeId}>
                      <img
                        src={photo.variants[0].src}
                        width={photo.variants[0].width}
                        height={photo.variants[0].height}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                      <div>
                        <h3>{photo.venue}</h3>
                        <a href={photo.source} target="_blank" rel="noreferrer">
                          {photo.title}
                        </a>
                        <p>
                          {photo.author} ·{" "}
                          <a
                            href={photo.licenseUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {photo.license}
                          </a>
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
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
                  explicit answers and balance when set. They do not embed
                  provider descriptions, images, credentials, or a fresh-result
                  claim.
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
