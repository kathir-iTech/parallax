# Frozen synthetic comparison protocol and results

This report uses an authored ordinal fixture, not a dataset of human place choices. Regret is measured against each simulated utility generator. It does not establish real enjoyment, Qloo superiority, novelty, or a winning probability.

Protocol: 5 predeclared families × 40 fixed seeds × 8 policies = 1600 executions. At most 3 interactions; skipped comparisons count. VOI may stop earlier at the declared modeled-benefit threshold. Other selectors share the same prior, likelihood, evidence, and interaction cap. No-question controls use zero answers; costs are reported rather than hidden.

The first-lens ablation removes the second cultural feature; it is not a genre-only or non-Qloo recommendation system. The direct baseline in this synthetic fixture is an authored ordering, not a live Qloo result. Live-case evidence is reported separately. Explicit weighting is exposed as a product control but no oracle-weight result is presented as a fair interactive baseline.

| Generator      | Policy              | Mean simulated regret |      SE | Questions | Skips |
| -------------- | ------------------- | --------------------: | ------: | --------: | ----: |
| matched        | voi                 |               0.03507 | 0.01935 |         1 |     0 |
| matched        | entropy             |               0.01066 | 0.00967 |         3 |     0 |
| matched        | uncertainty         |               0.17216 | 0.04511 |         3 |     0 |
| matched        | random              |               0.05766 | 0.02848 |         3 |     0 |
| matched        | fixed               |               0.15839 | 0.04011 |         3 |     0 |
| matched        | equal-no-questions  |               0.24777 | 0.03118 |         0 |     0 |
| matched        | direct-no-questions |               0.24886 | 0.02473 |         0 |     0 |
| matched        | first-lens-ablation |               0.24558 | 0.05245 |         0 |     0 |
| nonlinear      | voi                 |               0.03895 | 0.01931 |         1 |     0 |
| nonlinear      | entropy             |               0.01454 | 0.00985 |         3 |     0 |
| nonlinear      | uncertainty         |               0.12194 | 0.03744 |         3 |     0 |
| nonlinear      | random              |               0.06353 | 0.02731 |         3 |     0 |
| nonlinear      | fixed               |               0.03468 | 0.01167 |         3 |     0 |
| nonlinear      | equal-no-questions  |               0.23102 | 0.02285 |         0 |     0 |
| nonlinear      | direct-no-questions |               0.26396 | 0.02729 |         0 |     0 |
| nonlinear      | first-lens-ablation |               0.24946 | 0.05203 |         0 |     0 |
| noisy          | voi                 |               0.09589 | 0.03277 |         1 |     0 |
| noisy          | entropy             |                0.0769 | 0.02886 |         3 |     0 |
| noisy          | uncertainty         |               0.21996 | 0.05023 |         3 |     0 |
| noisy          | random              |                0.1238 | 0.04045 |         3 |     0 |
| noisy          | fixed               |               0.19465 | 0.04477 |         3 |     0 |
| noisy          | equal-no-questions  |               0.24777 | 0.03118 |         0 |     0 |
| noisy          | direct-no-questions |               0.24886 | 0.02473 |         0 |     0 |
| noisy          | first-lens-ablation |               0.24558 | 0.05245 |         0 |     0 |
| context-change | voi                 |               0.33501 | 0.05907 |         1 |     0 |
| context-change | entropy             |               0.05298 | 0.02732 |         3 |     0 |
| context-change | uncertainty         |               0.17225 | 0.04439 |         3 |     0 |
| context-change | random              |               0.11299 | 0.03698 |         3 |     0 |
| context-change | fixed               |               0.12959 | 0.03388 |         3 |     0 |
| context-change | equal-no-questions  |               0.24573 | 0.02943 |         0 |     0 |
| context-change | direct-no-questions |               0.25402 | 0.02398 |         0 |     0 |
| context-change | first-lens-ablation |               0.22914 | 0.05052 |         0 |     0 |
| unfamiliar     | voi                 |                0.0825 | 0.02742 |       1.4 |  0.55 |
| unfamiliar     | entropy             |               0.06237 | 0.02485 |      2.85 | 1.125 |
| unfamiliar     | uncertainty         |               0.15723 | 0.03894 |      2.85 | 1.125 |
| unfamiliar     | random              |               0.13763 | 0.03598 |      2.85 | 1.125 |
| unfamiliar     | fixed               |               0.17835 | 0.04326 |      2.85 | 1.125 |
| unfamiliar     | equal-no-questions  |               0.24777 | 0.03118 |         0 |     0 |
| unfamiliar     | direct-no-questions |               0.24886 | 0.02473 |         0 |     0 |
| unfamiliar     | first-lens-ablation |               0.24558 | 0.05245 |         0 |     0 |

Matched: linear rank utility and matching noise. Nonlinear: squared/square-root per-lens utility. Noisy: higher response noise. Context-change: weight changes after first interaction. Unfamiliar: 40% skip probability.

Interpretations must retain ties, losses, and model mismatch. This is engineering stress evidence, not independent human validation.
