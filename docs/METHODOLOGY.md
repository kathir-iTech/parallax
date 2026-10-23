# Decision and state contract

## Provider contribution

The tool resolves typed artist/movie entities, discovers up to ten places per confirmed reference in Qloo's New York City location query, and constructs a deterministic round-robin union. Admitted places require coordinates inside the selected area bounds and must not be marked closed. The same pool, capped at ten, is ranked separately through every reference and once through the combined signal for the direct baseline. Unexpected output identities are discarded. Only the common covered subset enters the finite model; fewer than six common places produce an explicit insufficient-evidence error.

Qloo supplies cultural associations and available place facts. PARALLAX supplies the candidate-selection policy, ordinal feature transform, finite model, prospective comparison policy, local state, geographic checks, and presentation. The application does not interpret provider ranking as a calibrated probability.

## Exact finite model

For reference j and candidate c, `f_j(c) = (m - 1 - position_j(c))/(m - 1)`. Enumerate weight vectors on a 0.1 simplex grid. Utility is `u_w(c)=sum_j w_j*f_j(c)`. The prior is uniform. Given a relative choice A/B, use `P(A|w)=logistic((u_w(A)-u_w(B))/0.18)`. Rebuild log likelihoods from the retained answer set and normalize using a common log shift.

For eligible set C, modeled regret is `R(p)=min_c sum_w p(w)[max_y u_w(y)-u_w(c)]`. The acquisition value of a pair is current regret less the answer-probability-weighted regret after A or B. Enumerate all unasked eligible pairs; ties keep the first pair in admitted order. Recommend by expected utility with stable ID tie breaking.

These are established decision and preference-learning methods applied to a bounded place-choice task. This project does not claim to have invented Bayesian preference learning, cultural recommendation, or value of information.

## Nonrelative responses and stopping

- Both acceptable: record; no relative posterior update.
- Neither: reversible hard veto of both compared identities for this outing.
- Skip: record; no relative posterior update; two consecutive skips stop.
- Three relative answers, eight total interactions, no eligible pair above 0.002 modeled utility value, or explicit user weighting can stop questioning.
- No eligible place: report exhaustion and offer history/input correction.
- Duplicate references are rejected; identical rank bases do not force a question.

The expected-value calculation models A/B channels only. Skip/veto overhead is reported in experiments rather than being silently treated as preference accuracy. Explicit sliders snap to the same finite weight grid and are labeled user weighting rather than learned preference.

## Correction and provenance

Answers contain a comparison ID, two admitted entity identities, and an explicit response. Removal deletes that payload from the retained list, queues compact local persistence, and recomputes from the prior. No stored posterior is trusted as input. A generation token prevents older live searches from overwriting a new context; cancellation is best effort and cannot refund a transmitted provider request.

Changing a cultural reference invalidates prior evidence and answers. Refreshing evidence within the same references retains only comparisons whose two places remain in the candidate set, with a visible removal count. Imported preferences require new live evidence; a local restored observation is explicitly labeled with its original retrieval time.

## Validation scope

An independent brute-force oracle checks every pair's modeled value, rather than calling the production regret function. Synthetic comparisons include matched, nonlinear, noisy, changed-context, and unfamiliarity-heavy generators. Finite-model consistency does not establish human preference accuracy. Builder observations are not an independent study. See the frozen protocol and complete results in `docs/evaluation/`.
