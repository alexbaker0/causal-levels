/// <reference lib="webworker" />
/**
 * Runs the Noble model off the main thread. The worker owns the state and
 * integrates in real time at `speed` model-ms per wall-ms, posting batches of
 * samples for the UI to draw.
 */
import { type Controls, DEFAULT_DT, NobleSim } from "../../core/noble";

export type ToWorker =
  | { type: "controls"; controls: Partial<Controls> }
  | { type: "speed"; speed: number }
  | { type: "running"; running: boolean }
  | { type: "reset" };

export interface FromWorker {
  type: "samples";
  /** flattened rows of SAMPLE_WIDTH values */
  samples: Float32Array;
  t: number;
  y: [number, number, number, number];
  /** true for the first batch after a reset */
  fresh: boolean;
}

const SAMPLE_EVERY = 50; // 0.5 ms of model time at dt = 0.01 ms
const TICK_MS = 16;
const MAX_CATCHUP_MS = 100;

const sim = new NobleSim(DEFAULT_DT, SAMPLE_EVERY);
let speed = 1;
let running = true;
let fresh = true;
let last = performance.now();

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === "controls") sim.setControls(msg.controls);
  else if (msg.type === "speed") speed = msg.speed;
  else if (msg.type === "running") {
    running = msg.running;
    last = performance.now();
  } else if (msg.type === "reset") {
    sim.reset();
    sim.setControls({}); // re-apply an active clamp to the fresh state
    fresh = true;
  }
};

setInterval(() => {
  const now = performance.now();
  const elapsed = Math.min(MAX_CATCHUP_MS, now - last);
  last = now;
  if (!running) return;
  const samples = sim.advance(elapsed * speed).slice(); // copy so the buffer can be transferred
  const out: FromWorker = { type: "samples", samples, t: sim.t, y: [...sim.y], fresh };
  fresh = false;
  (self as DedicatedWorkerGlobalScope).postMessage(out, [samples.buffer]);
}, TICK_MS);
