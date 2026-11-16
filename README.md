# causal-levels

Two small interactive demos about high-level causation.

1. **Causal emergence on a Markov chain.** A macro description of a system can
   carry more effective information than the micro description it is built from.
2. **Voltage clamp on the Noble 1962 cardiac cell model.** A rhythm that belongs
   to neither the cell-level variable nor the molecular-level ones alone: fix
   either level and it stops.

React + Vite + TypeScript, tested with Vitest. No runtime dependencies beyond
React: the heatmaps and graphs are SVG, the time series and phase plane are
canvas.

Live: https://alexbaker0.github.io/causal-levels/ (deployed to GitHub Pages by
`.github/workflows/pages.yml` on every push to `main`).

## Run and test

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

`npm run dev` serves the app at http://localhost:5173. `npm test` runs the core
test suite (47 tests, about 25 s; most of that is the Noble integrations).
`npm run build` typechecks and writes a static site to `dist/`.

## Layout

```
src/core/     pure maths, no React imports, unit tested
  ei.ts         entropy, KL, effective information, coarse-graining
  partition.ts  set-partition enumeration, exhaustive and greedy search
  presets.ts    example transition matrices
  noble.ts      Noble 1962 equations, RK4, period measurement, stepper
  *.test.ts
src/demos/    UI
  emergence/    Demo 1
  noble/        Demo 2 (simulation runs in a web worker)
```

## Demo 1: causal emergence

Source: E. P. Hoel, L. Albantakis and G. Tononi (2013), "Quantifying causal
emergence shows that macro can beat micro", *PNAS* 110(49):19790-19795.

`T` is an `n x n` row-stochastic matrix, `T_i` is row `i`, and all logs are
base 2. Interventions set the current state uniformly at random.

| Quantity | Definition |
|---|---|
| Mean row | `Tbar = (1/n) sum_i T_i` |
| Effective information | `EI = (1/n) sum_i KL(T_i ‖ Tbar) = H(Tbar) - mean_i H(T_i)` |
| Determinism (bits) | `log2(n) - mean_i H(T_i)` |
| Degeneracy (bits) | `log2(n) - H(Tbar)` |
| Identity | `EI = determinism - degeneracy` |
| Normalised versions | each of the above divided by `log2(n)` |

**Coarse-graining.** Given a partition of the states into groups, the macro
transition probability from group `G` to group `G'` is the average over micro
states `i` in `G` of `sum_{j in G'} T_ij`. The macro EI is computed on that
matrix with a uniform distribution over macro states.

**Causal emergence** is `EI(macro) - EI(micro)`. Positive means the macro scale
is the better causal model.

**Partition search.** For `n <= 10` every set partition is evaluated (Bell(10)
= 115,975). Above that, a greedy merge starts from the micro scale, repeatedly
merges the pair of groups that gives the highest macro EI, continues down to a
single group, and returns the best partition seen along the way. Ties go to the
finer partition, so a system with nothing to gain returns the micro scale
itself. Greedy merge is a heuristic and can miss the optimum.

Tested facts (`src/core/ei.test.ts`):

- 8-state chain where states 1-7 go uniformly to 1-7 and state 8 goes to
  itself: micro EI = `3 - (7/8) log2 7` ≈ 0.544 bits; grouping `{1..7},{8}`
  gives macro EI = 1 bit, and exhaustive search finds that grouping.
- A permutation matrix has EI = `log2 n`, and every strict coarse-graining has
  lower EI.
- Identical rows give EI = 0.
- `EI = determinism - degeneracy`, and the KL and entropy forms of EI agree, on
  200 random matrices.

A note on the "noisy blocks" preset: with equal-sized blocks and no leak the
micro and macro EI are both exactly `log2(#blocks)`, so the preset uses unequal
blocks (8 states as 4 + 3 + 1), where the macro scale wins by about 0.13 bits.

In the UI: click a heatmap cell to edit it (the rest of the row rescales to sum
to 1); drag state chips between group buckets, or click a chip or a row label
to cycle its group.

## Demo 2: voltage clamp on the Noble 1962 model

Source: D. Noble (1962), "A modification of the Hodgkin-Huxley equations
applicable to Purkinje fibre action and pacemaker potentials", *J. Physiol.*
160:317-352.

The equations and constants were not written from memory. They were transcribed
from the CellML encoding of the paper (`noble_model_1962`), using two hosted
copies whose constants agree:

- OpenCOR: <https://github.com/opencor/opencor/blob/master/models/noble_model_1962.cellml>
- libCellML generated code: <https://github.com/cellml/libcellml/blob/develop/tests/resources/generator/noble_model_1962/model.py>

Units: mV, ms, mS/cm², µA/cm², µF/cm².

```
Cm dV/dt = -(i_Na + i_K + i_Leak)                    Cm = 12
i_Na   = (400 m^3 h + 0.14) (V - 40)
i_K    = (g_K1 + g_K2) (V + 100)
         g_K1 = 1.2 exp((-V - 90)/50) + 0.015 exp((V + 90)/60)
         g_K2 = 1.2 n^4
i_Leak = 0.075 (V + 60)
dx/dt  = alpha_x (1 - x) - beta_x x                  x in {m, h, n}

alpha_m = 0.1 (-V - 48) / (exp((-V - 48)/15) - 1)
beta_m  = 0.12 (V + 8) / (exp((V + 8)/5) - 1)
alpha_h = 0.17 exp((-V - 90)/20)
beta_h  = 1 / (1 + exp((-V - 42)/10))
alpha_n = 0.0001 (-V - 50) / (exp((-V - 50)/10) - 1)
beta_n  = 0.002 exp((-V - 90)/80)

Initial state: V = -87, m = 0.01, h = 0.8, n = 0.01
```

Steady states are `x_inf(V) = alpha_x / (alpha_x + beta_x)` and time constants
`tau_x(V) = 1 / (alpha_x + beta_x)`. The three rate expressions of the form
`x / (exp(x/k) - 1)` are continued through their removable singularities.

**Numerics.** Fixed-step classical RK4 with `dt = 0.01 ms`. The fastest
process is the m gate (`tau_m` between about 0.1 and 0.2 ms), so the step is at
least five times smaller than its time constant everywhere. The UI runs the
integration in a web worker, which streams samples every 0.5 ms of model time
to the main thread.

**What the unclamped model does.** It oscillates spontaneously with a period of
564.16 ms, from a maximum diastolic potential of -81.6 mV to a peak of +23.4 mV,
spending about 250 ms of each cycle above -50 mV (the plateau), with an upstroke
more than ten times faster than repolarisation. Those features (spontaneous
pacemaker activity at roughly two beats per second, overshoot, long plateau)
are the ones the paper's figures show. I could not open the paper's figures
from this build environment, so the comparison is against these published
characteristics and not a point-by-point overlay.

Tested facts (`src/core/noble.test.ts`):

- Unclamped: at least 20 beats in 12 s, still beating at the end, beat-to-beat
  variation under 0.01 % after the first two beats.
- Clamped at -90, -80, -60, -40, -20, 0 and 20 mV: m, h and n converge to
  `m_inf(V)`, `h_inf(V)`, `n_inf(V)` to six decimal places, all derivatives
  fall below 1e-9, and no beats occur. Releasing the clamp restores the
  564 ms rhythm.
- Halving the time step changes the period by less than 1 % (in fact by less
  than 0.001 %; a step ten times larger still agrees to 0.1 %).
- Freezing any one of m, h or n while V runs free stops the rhythm: V settles
  to a constant. Unfreezing restores it.

**The experiments.**

- *Clamp voltage* holds V at the slider value. The gates relax to constants.
- *Freeze gate* holds one gating variable at the value it has at that moment
  while V and the other gates run free. V settles to a steady level, depolarised
  or resting depending on when you froze it.
- Neither level drives the rhythm on its own. Voltage sets the gate rates, the
  gates set the currents, the currents change the voltage.

In the currents panel the y-axis is clipped at -80 µA/cm², because the i_Na
upstroke spike reaches about -475 and would flatten everything else.
