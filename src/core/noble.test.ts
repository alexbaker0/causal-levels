import { describe, expect, it } from "vitest";
import {
  type Gate,
  type NobleState,
  DEFAULT_DT,
  FREE,
  H,
  M,
  N,
  NOBLE_INITIAL,
  NobleSim,
  SAMPLE_WIDTH,
  V,
  currents,
  derivative,
  periods,
  rates,
  rk4Step,
  run,
  steadyState,
  timeConstants,
} from "./noble";

/** Mean of the periods after discarding the first `skip` beats. */
function settledPeriod(dt: number, duration = 6000, skip = 2): { mean: number; spread: number; beats: number } {
  const p = periods(run(NOBLE_INITIAL, duration, dt).upstrokes).slice(skip);
  const mean = p.reduce((a, b) => a + b, 0) / p.length;
  return { mean, spread: Math.max(...p) - Math.min(...p), beats: p.length };
}

describe("rate functions", () => {
  it("are finite and continuous through their removable singularities", () => {
    // alpha_m at V = -48, beta_m at V = -8, alpha_n at V = -50
    for (const [v0, key] of [
      [-48, "alphaM"],
      [-8, "betaM"],
      [-50, "alphaN"],
    ] as const) {
      const at = rates(v0)[key];
      expect(Number.isFinite(at)).toBe(true);
      expect(rates(v0 - 1e-4)[key]).toBeCloseTo(at, 4);
      expect(rates(v0 + 1e-4)[key]).toBeCloseTo(at, 4);
    }
    expect(rates(-48).alphaM).toBeCloseTo(0.1 * 15, 12);
    expect(rates(-8).betaM).toBeCloseTo(0.12 * 5, 12);
    expect(rates(-50).alphaN).toBeCloseTo(0.0001 * 10, 12);
  });

  it("match the libCellML generated code at the initial state", () => {
    // Reference values evaluated from the expressions in libCellML's
    // noble_model_1962/model.py at V=-87, m=0.01, h=0.8, n=0.01.
    const v = -87;
    const r = rates(v);
    expect(r.alphaM).toBeCloseTo((0.1 * (-v - 48)) / (Math.exp((-v - 48) / 15) - 1), 12);
    expect(r.betaM).toBeCloseTo((0.12 * (v + 8)) / (Math.exp((v + 8) / 5) - 1), 12);
    expect(r.alphaH).toBeCloseTo(0.17 * Math.exp((-v - 90) / 20), 12);
    expect(r.betaH).toBeCloseTo(1 / (1 + Math.exp((-v - 42) / 10)), 12);
    expect(r.alphaN).toBeCloseTo((0.0001 * (-v - 50)) / (Math.exp((-v - 50) / 10) - 1), 12);
    expect(r.betaN).toBeCloseTo(0.002 * Math.exp((-v - 90) / 80), 12);
    const c = currents(NOBLE_INITIAL);
    expect(c.iNa).toBeCloseTo((0.01 ** 3 * 0.8 * 400 + 0.14) * (v - 40), 10);
    expect(c.iK).toBeCloseTo(
      (1.2 * Math.exp((-v - 90) / 50) + 0.015 * Math.exp((v + 90) / 60) + 1.2 * 0.01 ** 4) * (v + 100),
      10,
    );
    expect(c.iLeak).toBeCloseTo(0.075 * (v + 60), 12);
    expect(derivative(NOBLE_INITIAL)[V]).toBeCloseTo(-(c.iNa + c.iK + c.iLeak) / 12, 12);
  });

  it("the m gate is by far the fastest and n the slowest", () => {
    for (const v of [-90, -60, -30, 0, 20]) {
      const tau = timeConstants(v);
      expect(tau.m).toBeLessThan(0.25);
      expect(tau.m).toBeLessThan(tau.h);
      expect(tau.h).toBeLessThan(tau.n);
      expect(tau.n).toBeGreaterThan(100);
    }
  });
});

describe("unclamped model", () => {
  it("oscillates spontaneously with a stable period after transients", () => {
    const r = run(NOBLE_INITIAL, 12000, DEFAULT_DT, FREE, 2000);
    const p = periods(r.upstrokes);
    expect(r.upstrokes.length).toBeGreaterThanOrEqual(20);
    const settled = p.slice(2);
    const mean = settled.reduce((a, b) => a + b, 0) / settled.length;
    // sustained: beats keep coming right up to the end of the run
    expect(12000 - r.upstrokes[r.upstrokes.length - 1]).toBeLessThan(mean);
    // stable: beat-to-beat variation under 0.01%
    for (const x of settled) expect(Math.abs(x - mean) / mean).toBeLessThan(1e-4);
    // pacemaker rate of roughly two beats per second
    expect(mean).toBeGreaterThan(450);
    expect(mean).toBeLessThan(700);
  });

  it("has Purkinje-like action potentials: overshoot, long plateau, slow diastolic depolarisation", () => {
    const dt = DEFAULT_DT;
    let y: NobleState = [...NOBLE_INITIAL] as NobleState;
    for (let s = 0; s < 2000 / dt; s++) y = rk4Step(y, dt); // discard transient
    let vMin = Infinity;
    let vMax = -Infinity;
    let above = 0;
    let maxUp = 0;
    let maxDown = 0;
    const steps = Math.round((4 * 564.164) / dt); // about four cycles
    for (let s = 0; s < steps; s++) {
      const next = rk4Step(y, dt);
      const dv = (next[V] - y[V]) / dt;
      maxUp = Math.max(maxUp, dv);
      maxDown = Math.min(maxDown, dv);
      y = next;
      vMin = Math.min(vMin, y[V]);
      vMax = Math.max(vMax, y[V]);
      if (y[V] > -50) above++;
    }
    expect(vMax).toBeGreaterThan(10); // overshoot above 0 mV
    expect(vMax).toBeLessThan(40); // bounded by E_Na
    expect(vMin).toBeLessThan(-75); // maximum diastolic potential
    expect(vMin).toBeGreaterThan(-100); // bounded by E_K
    // plateau: depolarised above -50 mV for 200-350 ms of each ~564 ms cycle
    const plateauMs = (above * dt) / 4;
    expect(plateauMs).toBeGreaterThan(200);
    expect(plateauMs).toBeLessThan(350);
    // fast upstroke, much slower repolarisation
    expect(maxUp).toBeGreaterThan(10 * Math.abs(maxDown));
  });
});

describe("numerical convergence", () => {
  it("halving the time step changes the period by less than 1%", () => {
    const a = settledPeriod(DEFAULT_DT);
    const b = settledPeriod(DEFAULT_DT / 2);
    expect(a.beats).toBeGreaterThanOrEqual(5);
    expect(Math.abs(a.mean - b.mean) / b.mean).toBeLessThan(0.01);
    // in fact the agreement is far tighter than required
    expect(Math.abs(a.mean - b.mean) / b.mean).toBeLessThan(1e-5);
  });

  it("the default step resolves the fast m gate", () => {
    let tauMin = Infinity;
    for (let v = -100; v <= 40; v += 0.5) tauMin = Math.min(tauMin, timeConstants(v).m);
    expect(DEFAULT_DT).toBeLessThan(tauMin / 5);
  });

  it("a ten times coarser step still gives the same period to 0.1%", () => {
    const coarse = settledPeriod(DEFAULT_DT * 10);
    const fine = settledPeriod(DEFAULT_DT);
    expect(Math.abs(coarse.mean - fine.mean) / fine.mean).toBeLessThan(1e-3);
  });
});

describe("voltage clamp", () => {
  it.each([-90, -80, -60, -40, -20, 0, 20])("at %i mV the gates converge to m_inf, h_inf, n_inf and stay there", (vc) => {
    const controls = { clampV: vc, frozen: null };
    // start mid-beat so the gates have somewhere to go
    const start = run(NOBLE_INITIAL, 700).y;
    const r = run(start, 10000, DEFAULT_DT, controls, 0);
    const inf = steadyState(vc);
    expect(r.y[V]).toBe(vc);
    expect(r.vMin).toBe(vc);
    expect(r.vMax).toBe(vc);
    expect(r.upstrokes.length).toBe(0);
    expect(r.y[M]).toBeCloseTo(inf.m, 6);
    expect(r.y[H]).toBeCloseTo(inf.h, 6);
    expect(r.y[N]).toBeCloseTo(inf.n, 6);
    // stopped: every derivative is essentially zero
    for (const d of derivative(r.y, controls)) expect(Math.abs(d)).toBeLessThan(1e-9);
    // and a further second changes nothing
    const later = run(r.y, 1000, DEFAULT_DT, controls).y;
    for (const i of [M, H, N]) expect(Math.abs(later[i] - r.y[i])).toBeLessThan(1e-8);
  });

  it("gates relax monotonically in the limit: each approaches its target exponentially", () => {
    const vc = -40;
    const controls = { clampV: vc, frozen: null };
    const inf = steadyState(vc);
    let y: NobleState = [vc, 0.05, 0.8, 0.45];
    let prev = Math.abs(y[N] - inf.n);
    for (let k = 0; k < 20; k++) {
      y = run(y, 100, DEFAULT_DT, controls).y;
      const err = Math.abs(y[N] - inf.n);
      expect(err).toBeLessThan(prev);
      prev = err;
    }
  });

  it("releasing the clamp restarts the rhythm with the original period", () => {
    for (const vc of [-80, -40, 0]) {
      const held = run(NOBLE_INITIAL, 5000, DEFAULT_DT, { clampV: vc, frozen: null }).y;
      const p = periods(run(held, 6000).upstrokes).slice(2);
      expect(p.length).toBeGreaterThanOrEqual(5);
      for (const x of p) expect(x).toBeCloseTo(564.164, 1);
    }
  });
});

describe("freezing a gate (the reverse experiment)", () => {
  it.each(["m", "h", "n"] as Gate[])("with %s frozen, V runs free but settles to rest: no rhythm", (gate) => {
    // freeze at several phases of the cycle
    for (const phase of [150, 450]) {
      const start = run(NOBLE_INITIAL, 2000 + phase).y;
      const r = run(start, 8000, DEFAULT_DT, { clampV: null, frozen: gate }, 7000);
      const index = { m: M, h: H, n: N }[gate];
      expect(r.y[index]).toBe(start[index]);
      expect(r.vMax - r.vMin).toBeLessThan(1e-3);
      expect(r.upstrokes.filter((t) => t > 2000).length).toBe(0);
    }
  });

  it("unfreezing restores the rhythm", () => {
    const start = run(NOBLE_INITIAL, 2300).y;
    const frozen = run(start, 5000, DEFAULT_DT, { clampV: null, frozen: "n" }).y;
    const p = periods(run(frozen, 6000).upstrokes).slice(2);
    expect(p.length).toBeGreaterThanOrEqual(5);
    for (const x of p) expect(x).toBeCloseTo(564.164, 1);
  });
});

describe("NobleSim stepper", () => {
  it("matches run() and samples at the requested interval", () => {
    const sim = new NobleSim(DEFAULT_DT, 50);
    const a = sim.advance(300);
    const b = sim.advance(200.004); // chunk sizes need not be multiples of the sample interval
    const ref = run(NOBLE_INITIAL, 500).y;
    for (let i = 0; i < 4; i++) expect(sim.y[i]).toBeCloseTo(ref[i], 9);
    expect(a.length).toBe((300 / 0.5) * SAMPLE_WIDTH);
    expect(a[0]).toBeCloseTo(0.5, 6);
    expect(b[0]).toBeCloseTo(300.5, 3);
    expect(sim.t).toBeCloseTo(500, 9);
  });

  it("applies and releases controls", () => {
    const sim = new NobleSim();
    sim.advance(100);
    sim.setControls({ clampV: -30 });
    const s = sim.advance(50);
    for (let k = 1; k < s.length; k += SAMPLE_WIDTH) expect(s[k]).toBe(-30);
    sim.setControls({ clampV: null, frozen: "n" });
    const n0 = sim.y[N];
    sim.advance(50);
    expect(sim.y[N]).toBe(n0);
    expect(sim.y[V]).not.toBe(-30);
    sim.reset();
    expect(sim.t).toBe(0);
    expect(sim.y).toEqual([...NOBLE_INITIAL]);
  });
});
