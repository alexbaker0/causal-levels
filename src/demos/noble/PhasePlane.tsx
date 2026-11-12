import { useEffect, useMemo, useRef } from "react";
import { type NobleState, NOBLE_INITIAL, rk4Step, steadyState } from "../../core/noble";
import type { Theme } from "../../theme";
import { FONT, fitCanvas, readPalette } from "./canvas";
import type { SampleStore } from "./store";

const V_MIN = -100;
const V_MAX = 50;
const PAD = { l: 38, r: 12, t: 10, b: 30 };
/** how much recent trajectory to draw, ms of model time */
const TRAIL_MS = 1500;

/** One period of the free-running limit cycle, precomputed once after the transient has died away. */
function limitCycle(): [number, number][] {
  const dt = 0.05;
  let y: NobleState = [...NOBLE_INITIAL] as NobleState;
  for (let s = 0; s < 3000 / dt; s++) y = rk4Step(y, dt);
  const pts: [number, number][] = [];
  for (let s = 0; s < 570 / dt; s++) {
    y = rk4Step(y, dt);
    if (s % 10 === 0) pts.push([y[0], y[3]]);
  }
  return pts;
}

interface Props {
  store: SampleStore;
  theme: Theme;
  clampV: number | null;
  /** value n is frozen at, if it is */
  frozenN: number | null;
}

/** V-n phase plane: the limit cycle, the n-nullcline n_inf(V), and the live trajectory. */
export function PhasePlane({ store, theme, clampV, frozenN }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cycle = useMemo(limitCycle, []);
  const nullcline = useMemo(() => {
    const pts: [number, number][] = [];
    for (let v = V_MIN; v <= V_MAX; v += 1) pts.push([v, steadyState(v).n]);
    return pts;
  }, []);

  useEffect(() => {
    const canvas = ref.current!;
    const pal = readPalette();
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { ctx, w, h } = fitCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      ctx.font = FONT;
      const pw = w - PAD.l - PAD.r;
      const ph = h - PAD.t - PAD.b;
      const X = (v: number) => PAD.l + ((v - V_MIN) / (V_MAX - V_MIN)) * pw;
      const Y = (n: number) => PAD.t + (1 - n) * ph;

      // grid and axes
      ctx.strokeStyle = pal.border;
      ctx.fillStyle = pal.muted;
      ctx.lineWidth = 1;
      ctx.textBaseline = "top";
      ctx.textAlign = "center";
      for (const v of [-100, -50, 0, 50]) {
        const gx = Math.round(X(v)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(gx, PAD.t);
        ctx.lineTo(gx, PAD.t + ph);
        ctx.stroke();
        ctx.fillText(String(v), gx, PAD.t + ph + 4);
      }
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (const n of [0, 0.5, 1]) {
        const gy = Math.round(Y(n)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(PAD.l, gy);
        ctx.lineTo(PAD.l + pw, gy);
        ctx.stroke();
        ctx.fillText(String(n), PAD.l - 6, gy);
      }
      ctx.fillStyle = pal.text2;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("V (mV)", PAD.l + pw / 2, h - 2);
      ctx.save();
      ctx.translate(10, PAD.t + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("n", 0, 4);
      ctx.restore();

      const path = (pts: [number, number][], close = false) => {
        ctx.beginPath();
        pts.forEach(([v, n], i) => (i ? ctx.lineTo(X(v), Y(n)) : ctx.moveTo(X(v), Y(n))));
        if (close) ctx.closePath();
        ctx.stroke();
      };

      // n-nullcline: where a clamped cell's n must come to rest
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = pal.muted;
      ctx.lineWidth = 1.5;
      path(nullcline);
      ctx.restore();
      ctx.fillStyle = pal.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("n∞(V)", X(8), Y(steadyState(8).n) - 5);

      // reference limit cycle
      ctx.strokeStyle = pal.muted;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      path(cycle, true);
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("limit cycle", X(-96), Y(0.74));

      // clamp line
      if (clampV !== null) {
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = pal.text2;
        ctx.beginPath();
        ctx.moveTo(X(clampV), PAD.t);
        ctx.lineTo(X(clampV), PAD.t + ph);
        ctx.stroke();
        ctx.restore();
      }

      if (frozenN !== null) {
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = pal.text2;
        ctx.beginPath();
        ctx.moveTo(PAD.l, Y(frozenN));
        ctx.lineTo(PAD.l + pw, Y(frozenN));
        ctx.stroke();
        ctx.restore();
      }

      // recent trajectory, fading with age
      if (store.count > 1) {
        const from = store.lowerBound(store.tNow - TRAIL_MS);
        const total = store.count - from;
        const SEGMENTS = 12;
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        for (let sgm = 0; sgm < SEGMENTS; sgm++) {
          const a = from + Math.floor((total * sgm) / SEGMENTS);
          const b = from + Math.floor((total * (sgm + 1)) / SEGMENTS);
          if (b - a < 1) continue;
          ctx.globalAlpha = 0.12 + (0.88 * (sgm + 1)) / SEGMENTS;
          ctx.beginPath();
          for (let r = Math.max(from, a - 1); r <= Math.min(store.count - 1, b); r++) {
            const px = X(store.at(r, 1));
            const py = Y(store.at(r, 4));
            if (r === Math.max(from, a - 1)) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const lastRow = store.count - 1;
        ctx.fillStyle = pal.accent;
        ctx.strokeStyle = pal.surface;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(X(store.at(lastRow, 1)), Y(store.at(lastRow, 4)), 5.5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [store, theme, clampV, frozenN, cycle, nullcline]);

  return <canvas ref={ref} className="pp-canvas" role="img" aria-label="Phase plane of membrane potential against the n gate" />;
}
