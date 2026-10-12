# costengine

Monte Carlo benefit-cost analysis for public programs, in the style of the Washington State
Institute for Public Policy's model. It has two parts: a typed TypeScript engine, and a
calculator that runs entirely in the browser.

You describe what a program costs, which outcomes it changes, and what each change is worth
to participants, taxpayers and everyone else, giving every uncertain number a range. The
engine draws every input thousands of times. For each draw it builds the full stream of
yearly costs and benefits, discounts it, and reports:

- **Expected net present value**, with its Monte Carlo standard error and the 5th–95th
  percentile range.
- **Benefit per dollar of cost**, with the interval across draws.
- **The chance the program pays for itself**: the share of draws with positive net value.
- **Who gains and who pays**: expected present value for participants, taxpayers, others
  in society, and the deadweight cost of raising tax money.
- **Internal rate of return and payback year**, from the expected cash-flow stream.
- **Which assumptions matter**: a tornado of NPV with each input at its 10th and 90th
  percentile, plus rank correlations between every input and NPV.

## The model

For each draw, the engine computes:

- **Costs.** For year *t*, a cost of *c* per participant from its first year for its
  duration contributes *c × participants*, charged to its payer.
- **Effects.** An effect of size *e* per participant, starting in year *s* and fading by
  *d* a year, contributes *e × implementation × (1 − d)^(t − s) × participants* units in
  year *t*. Each unit is worth *v* dollars to each perspective that values it.
- **Deadweight.** Net taxpayer flows carry a deadweight cost of *λ* per dollar. Spending
  adds *λ* to the cost and savings avoid it.
- **Discounting.** Flows are discounted at rate *r* from year 0.

The draws are joint: within a draw, a value or an effect size is the same in every year.
Uncertainty about a persistent quantity therefore doesn't average away across years.

Inputs can be fixed, normal (optionally truncated), lognormal (set by mean and sd),
uniform, triangular or PERT. Sampling uses xoshiro128\*\* with a user-set seed, so results
are reproducible.

## Use it

```bash
npm install
npm run dev                     # the calculator at http://localhost:5173
npm run build                   # static site in dist/web, CLI in dist/cli.js
node dist/cli.js presets
node dist/cli.js run "reentry services" --draws 50000 --seed 7
node dist/cli.js show "job training" > mine.json   # edit, then:
node dist/cli.js run mine.json --json
```

The calculator keeps the whole scenario in the URL, so a link reproduces the analysis
exactly. It also exports the scenario as JSON and every draw's NPV as CSV, and imports
scenario files. The simulation runs in a Web Worker, so the page stays responsive at
50,000 draws, and nothing leaves the browser.

## Example programs

The three presets use illustrative numbers chosen to show the engine's behavior, not
estimates for real programs:

| Program | Expected NPV | Benefit per $1 | Chance it pays off |
|---|---|---|---|
| Job training (500 people) | −$2.8M | $0.54 | 6% |
| Reentry services (1,000 people) | +$0.2M | $1.02 | 45% |
| Home visiting (300 families) | +$0.9M | $1.22 | 62% |

The reentry example is a coin flip. The tornado shows why: the size of the reconviction
effect and the dollar value of harm to victims each swing NPV by several million. Narrowing
those two estimates is worth more than refining anything else.

## Tests

```bash
npm run typecheck
npm run coverage    # 34 tests, 95% line coverage of the engine, charts and CLI
```

The tests check the following:

- **Closed forms.** Results match annuity present values, hand-computed fixed scenarios,
  decay with horizon truncation, and the deadweight accounting. Perspective totals add up
  to NPV.
- **Distributions.** Sample moments match the analytic ones for every distribution
  family, the uniform generator passes a χ² check, and seeds reproduce results.
- **Monte Carlo behavior.** Small and large runs agree within their reported standard
  error, and that error shrinks with √N.
- **Sensitivity.** The tornado ranks a dominant input first.
- **Robustness.** Invalid scenarios are refused with every problem listed. Share links
  round-trip, and user labels are escaped in every chart.

MIT licensed.
