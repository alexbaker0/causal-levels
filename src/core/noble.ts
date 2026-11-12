/**
 * Noble (1962) model of the cardiac Purkinje fibre action potential.
 *
 *   D. Noble, "A modification of the Hodgkin-Huxley equations applicable to
 *   Purkinje fibre action and pacemaker potentials", J. Physiol. 160:317-352
 *   (1962). doi:10.1113/jphysiol.1962.sp006849
 *
 * The equations, rate constants, parameters and initial conditions below are
 * transcribed from the CellML encoding of the paper (noble_model_1962), using
 * two independently hosted copies that agree term for term:
 *   - OpenCOR:   https://github.com/opencor/opencor/blob/master/models/noble_model_1962.cellml
 *   - libCellML: https://github.com/cellml/libcellml/blob/develop/tests/resources/generator/noble_model_1962/model.py
 * Both derive from the Physiome Model Repository entry for Noble 1962
 * (https://models.physiomeproject.org, search "Noble 1962").
 *
 * Units: V in mV, time in ms, conductances in mS/cm^2, currents in uA/cm^2,
 * Cm in uF/cm^2.
 *
 *   Cm dV/dt = -(i_Na + i_K + i_Leak)
 *   i_Na   = (g_Na_max m^3 h + 0.14) (V - E_Na)
 *   i_K    = (g_K1 + g_K2) (V + 100)
 *            g_K1 = 1.2 exp((-V - 90)/50) + 0.015 exp((V + 90)/60)
 *            g_K2 = 1.2 n^4
 *   i_Leak = g_L (V - E_L)
 *   dx/dt  = alpha_x (1 - x) - beta_x x        for x in {m, h, n}
 *
 *   alpha_m = 0.1 (-V - 48) / (exp((-V - 48)/15) - 1)
 *   beta_m  = 0.12 (V + 8)  / (exp((V + 8)/5) - 1)
 *   alpha_h = 0.17 exp((-V - 90)/20)
 *   beta_h  = 1 / (1 + exp((-V - 42)/10))
 *   alpha_n = 0.0001 (-V - 50) / (exp((-V - 50)/10) - 1)
 *   beta_n  = 0.002 exp((-V - 90)/80)
 */

export const NOBLE_PARAMS = {
  /** membrane capacitance, uF/cm^2 */
  Cm: 12,
  /** maximal fast sodium conductance, mS/cm^2 */
  gNaMax: 400,
  /** background sodium conductance, mS/cm^2 */
  gNaBackground: 0.14,
  /** sodium reversal potential, mV */
  ENa: 40,
  /** potassium reversal potential, mV */
  EK: -100,
  /** leak conductance, mS/cm^2 */
  gL: 0.075,
  /** leak reversal potential, mV */
  EL: -60,
} as const;

/** State vector layout: [V, m, h, n]. */
export type NobleState = [number, number, number, number];
export const V = 0;
export const M = 1;
export const H = 2;
export const N = 3;

export type Gate = "m" | "h" | "n";
export const GATE_INDEX: Record<Gate, number> = { m: M, h: H, n: N };

/** Initial conditions from the CellML model. */
export const NOBLE_INITIAL: Readonly<NobleState> = [-87, 0.01, 0.8, 0.01];

/**
 * Experimental interventions.
 * - clampV: hold the membrane potential at this value (voltage clamp).
 * - frozen: hold a gating variable at its present value while the rest run.
 */
export interface Controls {
  clampV: number | null;
  frozen: Gate | null;
}
export const FREE: Controls = { clampV: null, frozen: null };

/** x / (exp(x/k) - 1), continued through its removable singularity at x = 0. */
function xOverExpm1(x: number, k: number): number {
  const u = x / k;
  if (Math.abs(u) < 1e-7) return k * (1 - u / 2);
  return x / Math.expm1(u);
}

export interface Rates {
  alphaM: number;
  betaM: number;
  alphaH: number;
  betaH: number;
  alphaN: number;
  betaN: number;
}

/** Voltage-dependent opening (alpha) and closing (beta) rates, per ms. */
export function rates(v: number): Rates {
  return {
    alphaM: 0.1 * xOverExpm1(-v - 48, 15),
    betaM: 0.12 * xOverExpm1(v + 8, 5),
    alphaH: 0.17 * Math.exp((-v - 90) / 20),
    betaH: 1 / (1 + Math.exp((-v - 42) / 10)),
    alphaN: 0.0001 * xOverExpm1(-v - 50, 10),
    betaN: 0.002 * Math.exp((-v - 90) / 80),
  };
}

/** Steady-state gate values x_inf(V) = alpha / (alpha + beta). */
export function steadyState(v: number): { m: number; h: number; n: number } {
  const r = rates(v);
  return {
    m: r.alphaM / (r.alphaM + r.betaM),
    h: r.alphaH / (r.alphaH + r.betaH),
    n: r.alphaN / (r.alphaN + r.betaN),
  };
}

/** Gate time constants tau_x(V) = 1 / (alpha + beta), in ms. */
export function timeConstants(v: number): { m: number; h: number; n: number } {
  const r = rates(v);
  return {
    m: 1 / (r.alphaM + r.betaM),
    h: 1 / (r.alphaH + r.betaH),
    n: 1 / (r.alphaN + r.betaN),
  };
}

export interface Currents {
  iNa: number;
  iK: number;
  iLeak: number;
}

/** Ionic currents in uA/cm^2 (outward positive). */
export function currents(y: Readonly<NobleState>): Currents {
  const P = NOBLE_PARAMS;
  const v = y[V];
  const gNa = P.gNaMax * y[M] ** 3 * y[H] + P.gNaBackground;
  const gK1 = 1.2 * Math.exp((-v - 90) / 50) + 0.015 * Math.exp((v + 90) / 60);
  const gK2 = 1.2 * y[N] ** 4;
  return {
    iNa: gNa * (v - P.ENa),
    iK: (gK1 + gK2) * (v - P.EK),
    iLeak: P.gL * (v - P.EL),
  };
}

/** Right-hand side dy/dt. A clamped V or a frozen gate has derivative zero. */
export function derivative(y: Readonly<NobleState>, controls: Controls = FREE): NobleState {
  const r = rates(y[V]);
  const c = currents(y);
  const d: NobleState = [
    -(c.iNa + c.iK + c.iLeak) / NOBLE_PARAMS.Cm,
    r.alphaM * (1 - y[M]) - r.betaM * y[M],
    r.alphaH * (1 - y[H]) - r.betaH * y[H],
    r.alphaN * (1 - y[N]) - r.betaN * y[N],
  ];
  if (controls.clampV !== null) d[V] = 0;
  if (controls.frozen !== null) d[GATE_INDEX[controls.frozen]] = 0;
  return d;
}

/** One classical fourth-order Runge-Kutta step of size dt (ms). */
export function rk4Step(y: Readonly<NobleState>, dt: number, controls: Controls = FREE): NobleState {
  const y0: NobleState = [controls.clampV ?? y[V], y[M], y[H], y[N]];
  const add = (a: Readonly<NobleState>, k: Readonly<NobleState>, s: number): NobleState => [
    a[0] + s * k[0],
    a[1] + s * k[1],
    a[2] + s * k[2],
    a[3] + s * k[3],
  ];
  const k1 = derivative(y0, controls);
  const k2 = derivative(add(y0, k1, dt / 2), controls);
  const k3 = derivative(add(y0, k2, dt / 2), controls);
  const k4 = derivative(add(y0, k3, dt), controls);
  return [
    y0[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    y0[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    y0[2] + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
    y0[3] + (dt / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]),
  ];
}

/** Default integration step, ms. See the convergence test for why this is small enough. */
export const DEFAULT_DT = 0.01;
/** Threshold used to time action potentials: upward crossings of this voltage, mV. */
export const SPIKE_THRESHOLD = -20;

export interface RunSummary {
  /** final state */
  y: NobleState;
  /** interpolated times (ms) at which V crossed SPIKE_THRESHOLD upwards */
  upstrokes: number[];
  vMin: number;
  vMax: number;
}

/**
 * Integrate for `duration` ms with fixed-step RK4, recording upstroke times
 * and the voltage range seen after `statsFrom` ms.
 */
export function run(
  y0: Readonly<NobleState>,
  duration: number,
  dt: number = DEFAULT_DT,
  controls: Controls = FREE,
  statsFrom = 0,
): RunSummary {
  const steps = Math.round(duration / dt);
  let y: NobleState = [y0[0], y0[1], y0[2], y0[3]];
  const upstrokes: number[] = [];
  let vMin = Infinity;
  let vMax = -Infinity;
  for (let s = 0; s < steps; s++) {
    const next = rk4Step(y, dt, controls);
    // an imposed (clamped) voltage is not an action potential
    if (controls.clampV === null && y[V] < SPIKE_THRESHOLD && next[V] >= SPIKE_THRESHOLD) {
      upstrokes.push((s + (SPIKE_THRESHOLD - y[V]) / (next[V] - y[V])) * dt);
    }
    y = next;
    if ((s + 1) * dt >= statsFrom) {
      if (y[V] < vMin) vMin = y[V];
      if (y[V] > vMax) vMax = y[V];
    }
  }
  return { y, upstrokes, vMin, vMax };
}

/** Intervals between successive upstrokes. */
export function periods(upstrokes: readonly number[]): number[] {
  return upstrokes.slice(1).map((t, i) => t - upstrokes[i]);
}

/** Columns of one recorded sample. */
export const SAMPLE_FIELDS = ["t", "V", "m", "h", "n", "iNa", "iK", "iLeak"] as const;
export const SAMPLE_WIDTH = SAMPLE_FIELDS.length;

/**
 * Stateful stepper used by the web worker: advances in fixed RK4 steps and
 * records one sample every `sampleEvery` steps.
 */
export class NobleSim {
  y: NobleState = [...NOBLE_INITIAL] as NobleState;
  /** number of RK4 steps taken (time = steps * dt, with no accumulated drift) */
  steps = 0;
  controls: Controls = { clampV: null, frozen: null };

  constructor(
    readonly dt: number = DEFAULT_DT,
    readonly sampleEvery: number = 50,
  ) {}

  get t(): number {
    return this.steps * this.dt;
  }

  reset(): void {
    this.y = [...NOBLE_INITIAL] as NobleState;
    this.steps = 0;
  }

  setControls(c: Partial<Controls>): void {
    this.controls = { ...this.controls, ...c };
    if (this.controls.clampV !== null) this.y[V] = this.controls.clampV;
  }

  /** Advance by `duration` ms; returns the samples recorded, flattened SAMPLE_WIDTH per row. */
  advance(duration: number): Float32Array {
    const nSteps = Math.max(0, Math.round(duration / this.dt));
    const out = new Float32Array(Math.ceil(nSteps / this.sampleEvery + 1) * SAMPLE_WIDTH);
    let k = 0;
    for (let s = 0; s < nSteps; s++) {
      this.y = rk4Step(this.y, this.dt, this.controls);
      this.steps++;
      if (this.steps % this.sampleEvery === 0) {
        const c = currents(this.y);
        out[k++] = this.t;
        out[k++] = this.y[V];
        out[k++] = this.y[M];
        out[k++] = this.y[H];
        out[k++] = this.y[N];
        out[k++] = c.iNa;
        out[k++] = c.iK;
        out[k++] = c.iLeak;
      }
    }
    return out.subarray(0, k);
  }
}
