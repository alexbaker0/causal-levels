import { useEffect, useMemo, useRef, useState } from "react";
import { type Gate, GATE_INDEX, SAMPLE_WIDTH, SPIKE_THRESHOLD, steadyState } from "../../core/noble";
import type { Theme } from "../../theme";
import { PhasePlane } from "./PhasePlane";
import { TimeSeries } from "./TimeSeries";
import type { FromWorker, ToWorker } from "./sim.worker";
import { SampleStore } from "./store";

const WINDOW_MS = 4000;
const SPEEDS = [0.25, 0.5, 1, 2];

interface Live {
  t: number;
  y: [number, number, number, number];
  /** last measured interval between upstrokes, ms */
  period: number | null;
  /** model time of the most recent upstroke */
  lastBeat: number | null;
}

export function NobleDemo({ theme }: { theme: Theme }) {
  const store = useMemo(() => new SampleStore(), []);
  const workerRef = useRef<Worker | null>(null);
  const beat = useRef<{ last: number | null; period: number | null; prevV: number | null }>({
    last: null,
    period: null,
    prevV: null,
  });
  const clampedRef = useRef(false);

  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [clampOn, setClampOn] = useState(false);
  const [clampV, setClampV] = useState(-50);
  const [frozenOn, setFrozenOn] = useState(false);
  const [gate, setGate] = useState<Gate>("n");
  const [released, setReleased] = useState<string | null>(null);
  const [live, setLive] = useState<Live>({ t: 0, y: [-87, 0.01, 0.8, 0.01], period: null, lastBeat: null });

  const send = (msg: ToWorker) => workerRef.current?.postMessage(msg);

  useEffect(() => {
    const worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    let lastUi = 0;
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const { samples, t, y, fresh } = e.data;
      if (fresh) {
        store.clear();
        beat.current = { last: null, period: null, prevV: null };
      }
      // time the upstrokes (only meaningful while V is free)
      const b = beat.current;
      for (let k = 0; k < samples.length; k += SAMPLE_WIDTH) {
        const v = samples[k + 1];
        if (!clampedRef.current && b.prevV !== null && b.prevV < SPIKE_THRESHOLD && v >= SPIKE_THRESHOLD) {
          if (b.last !== null) b.period = samples[k] - b.last;
          b.last = samples[k];
        }
        b.prevV = v;
      }
      store.push(samples, t);
      const now = performance.now();
      if (now - lastUi > 100) {
        lastUi = now;
        setLive({ t, y, period: b.period, lastBeat: b.last });
      }
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [store]);

  const mark = (label: string) => store.markers.push({ t: store.tNow, label });

  const toggleClamp = () => {
    const on = !clampOn;
    setClampOn(on);
    clampedRef.current = on;
    beat.current.prevV = null;
    if (on) beat.current.period = null;
    send({ type: "controls", controls: { clampV: on ? clampV : null } });
    mark(on ? `clamp V = ${clampV} mV` : "clamp released");
    setReleased(on ? null : "clamp");
  };

  const changeClampV = (v: number) => {
    setClampV(v);
    if (clampOn) send({ type: "controls", controls: { clampV: v } });
  };

  const toggleFreeze = (g: Gate = gate) => {
    const on = !frozenOn;
    setFrozenOn(on);
    if (on) beat.current.period = null;
    send({ type: "controls", controls: { frozen: on ? g : null } });
    mark(on ? `${g} frozen` : `${g} released`);
    setReleased(on ? null : "freeze");
  };

  const reset = () => {
    send({ type: "reset" });
    setReleased(null);
  };

  const [V, m, h, n] = live.y;
  const frozenValue = live.y[GATE_INDEX[gate]];
  const inf = steadyState(clampOn ? clampV : V);
  const sinceBeat = live.lastBeat === null ? null : live.t - live.lastBeat;
  const beating = !clampOn && live.period !== null && sinceBeat !== null && sinceBeat < 1.5 * live.period;

  let caption: JSX.Element;
  if (clampOn && frozenOn) {
    caption = (
      <>
        <b>Fixed:</b> V at {clampV} mV and {gate} at {frozenValue.toFixed(3)}. <b>Result:</b> the two free gates
        relax to their steady-state values for this voltage and everything comes to rest.
      </>
    );
  } else if (clampOn) {
    caption = (
      <>
        <b>Fixed:</b> the membrane potential, held at {clampV} mV by the clamp. <b>Result:</b> with no voltage changes
        to drive them, the gates relax to constants (m∞ = {inf.m.toFixed(3)}, h∞ = {inf.h.toFixed(3)}, n∞ ={" "}
        {inf.n.toFixed(3)}) and the rhythm stops. Fixing the cell-level variable silences the molecular ones.
      </>
    );
  } else if (frozenOn) {
    caption = (
      <>
        <b>Fixed:</b> the {gate} gate, frozen at {frozenValue.toFixed(3)}; V and the other gates run free.{" "}
        <b>Result:</b> V drifts to a steady level ({V.toFixed(1)} mV now) and stays there. Without {gate} free to
        respond to voltage, the rhythm fails from below as well.
      </>
    );
  } else if (released) {
    caption = (
      <>
        <b>Fixed:</b> nothing; the {released === "clamp" ? "clamp" : "gate"} has been released. <b>Result:</b> voltage
        and gates are coupled in both directions again and the rhythm restarts on its own.
      </>
    );
  } else {
    caption = (
      <>
        <b>Fixed:</b> nothing. <b>Result:</b> voltage sets the gate rates, the gates set the currents, and the currents
        change the voltage. The loop sustains a spontaneous rhythm with long plateau action potentials.
      </>
    );
  }

  return (
    <div>
      <p className="intro">
        Noble's 1962 model of a cardiac Purkinje cell: membrane potential V and three channel gating variables m, h,
        n. The rhythm belongs to neither level alone. Clamp the cell-level voltage and the gates fall still; freeze a
        gate and the voltage falls still. Causation runs both down and up.
      </p>

      <div className="noble-grid">
        <section className="card">
          <h2>Time series</h2>
          <p className="sub">Last {WINDOW_MS / 1000} s of model time. Dashed lines mark interventions.</p>
          <TimeSeries store={store} theme={theme} windowMs={WINDOW_MS} />
        </section>

        <div className="noble-side">
          <section className="card">
            <h2>Experiment</h2>
            <div className="exp-row">
              <button aria-pressed={clampOn} className="exp-toggle" onClick={toggleClamp}>
                {clampOn ? "Release clamp" : "Clamp voltage"}
              </button>
              <label className="slider">
                <input
                  type="range"
                  min={-100}
                  max={40}
                  step={1}
                  value={clampV}
                  onChange={(e) => changeClampV(Number(e.target.value))}
                  aria-label="Clamp voltage in millivolts"
                />
                <span className="mono">{clampV} mV</span>
              </label>
            </div>
            <div className="exp-row">
              <button aria-pressed={frozenOn} className="exp-toggle" onClick={() => toggleFreeze()}>
                {frozenOn ? `Release ${gate}` : `Freeze gate ${gate}`}
              </button>
              <label>
                gate
                <select value={gate} disabled={frozenOn} onChange={(e) => setGate(e.target.value as Gate)}>
                  <option value="n">n (K⁺ activation)</option>
                  <option value="m">m (Na⁺ activation)</option>
                  <option value="h">h (Na⁺ inactivation)</option>
                </select>
              </label>
            </div>
            <p className="caption" aria-live="polite">
              {caption}
            </p>
            <div className="live mono">
              <span>V {V.toFixed(1)} mV</span>
              <span>m {m.toFixed(3)}</span>
              <span>h {h.toFixed(3)}</span>
              <span>n {n.toFixed(3)}</span>
              <span className="live-wide">
                {beating
                  ? `Beating: period ${live.period!.toFixed(0)} ms`
                  : clampOn || frozenOn
                    ? "No rhythm"
                    : "Waiting for two beats to time the period…"}
              </span>
            </div>
            <div className="exp-row" style={{ marginBottom: 0 }}>
              <button
                onClick={() => {
                  send({ type: "running", running: !running });
                  setRunning(!running);
                }}
              >
                {running ? "Pause" : "Run"}
              </button>
              <button onClick={reset}>Reset</button>
              <label>
                speed
                <select
                  value={speed}
                  onChange={(e) => {
                    const s = Number(e.target.value);
                    setSpeed(s);
                    send({ type: "speed", speed: s });
                  }}
                >
                  {SPEEDS.map((s) => (
                    <option key={s} value={s}>
                      {s}× real time
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="card">
            <h2>Phase plane: V against n</h2>
            <p className="sub">
              The free cell circles the limit cycle. Under clamp the point slides along the clamp line and stops on
              n∞(V); with n frozen it slides along a horizontal line to rest.
            </p>
            <PhasePlane store={store} theme={theme} clampV={clampOn ? clampV : null} frozenN={frozenOn && gate === "n" ? n : null} />
          </section>
        </div>
      </div>
    </div>
  );
}
