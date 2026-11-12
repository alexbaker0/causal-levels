import { useEffect, useRef } from "react";
import type { Theme } from "../../theme";
import { FONT, type Palette, fitCanvas, readPalette } from "./canvas";
import type { SampleStore } from "./store";

interface Series {
  col: number;
  key: keyof Palette;
  label: string;
}
interface Panel {
  title: string;
  min: number;
  max: number;
  ticks: number[];
  series: Series[];
  weight: number;
  digits: number;
}

// sample columns: t, V, m, h, n, iNa, iK, iLeak
const PANELS: Panel[] = [
  { title: "Membrane potential V (mV)", min: -100, max: 50, ticks: [-100, -50, 0, 50], weight: 1.15, digits: 1, series: [{ col: 1, key: "V", label: "V" }] },
  {
    title: "Gating variables",
    min: 0,
    max: 1,
    ticks: [0, 0.5, 1],
    weight: 1,
    digits: 3,
    series: [
      { col: 2, key: "m", label: "m" },
      { col: 3, key: "h", label: "h" },
      { col: 4, key: "n", label: "n" },
    ],
  },
  {
    title: "Ionic currents (µA/cm²); the upstroke i_Na spike, about −475, is clipped",
    min: -80,
    max: 60,
    ticks: [-80, -40, 0, 40],
    weight: 1,
    digits: 1,
    series: [
      { col: 5, key: "iNa", label: "i_Na" },
      { col: 6, key: "iK", label: "i_K" },
      { col: 7, key: "iLeak", label: "i_Leak" },
    ],
  },
];

const LEFT = 40;
const RIGHT = 50;
const TOP = 6;
const BOTTOM = 20;
const GAP = 26;

interface Props {
  store: SampleStore;
  theme: Theme;
  /** visible span of model time, ms */
  windowMs: number;
}

/** Scrolling stacked time series on a shared time axis, with a crosshair readout. */
export function TimeSeries({ store, theme, windowMs }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const hoverX = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const pal = readPalette();
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { ctx, w, h } = fitCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      ctx.font = FONT;
      const plotW = w - LEFT - RIGHT;
      const t1 = Math.max(store.tNow, windowMs);
      const t0 = t1 - windowMs;
      const xOf = (t: number) => LEFT + ((t - t0) / windowMs) * plotW;
      const totalWeight = PANELS.reduce((a, p) => a + p.weight, 0);
      const usable = h - TOP - BOTTOM - GAP * PANELS.length;
      const first = store.lowerBound(t0);

      let hoverRow = -1;
      if (hoverX.current !== null && store.count > 0) {
        const th = t0 + ((hoverX.current - LEFT) / plotW) * windowMs;
        hoverRow = Math.min(store.count - 1, store.lowerBound(th));
        if (th < store.at(0, 0) - 1 || th > store.tNow + 1) hoverRow = -1;
      }

      let y = TOP;
      PANELS.forEach((panel) => {
        const top = y + GAP - 8;
        const ph = (usable * panel.weight) / totalWeight + 8;
        const bottom = top + ph;
        const yOf = (v: number) => bottom - ((v - panel.min) / (panel.max - panel.min)) * ph;

        ctx.fillStyle = pal.text2;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(panel.title, LEFT, top - 7);

        // recessive grid and y labels
        ctx.strokeStyle = pal.border;
        ctx.lineWidth = 1;
        ctx.fillStyle = pal.muted;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        for (const tick of panel.ticks) {
          const gy = Math.round(yOf(tick)) + 0.5;
          ctx.beginPath();
          ctx.moveTo(LEFT, gy);
          ctx.lineTo(LEFT + plotW, gy);
          ctx.stroke();
          ctx.fillText(String(tick), LEFT - 6, gy);
        }

        // intervention markers
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = pal.muted;
        for (const mk of store.markers) {
          if (mk.t < t0) continue;
          const mx = Math.round(xOf(mk.t)) + 0.5;
          ctx.beginPath();
          ctx.moveTo(mx, top);
          ctx.lineTo(mx, bottom);
          ctx.stroke();
        }
        ctx.restore();

        // series
        ctx.save();
        ctx.beginPath();
        ctx.rect(LEFT, top - 1, plotW, ph + 2);
        ctx.clip();
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        for (const s of panel.series) {
          ctx.strokeStyle = pal[s.key];
          ctx.beginPath();
          for (let r = first; r < store.count; r++) {
            const px = xOf(store.at(r, 0));
            const py = yOf(store.at(r, s.col));
            if (r === first) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        ctx.restore();

        // direct labels at the right-hand end, nudged apart so they never overlap
        if (store.count > first) {
          const lastRow = store.count - 1;
          const xEnd = xOf(store.at(lastRow, 0));
          const tags = panel.series
            .map((s) => ({ s, y: Math.max(top + 5, Math.min(bottom - 5, yOf(store.at(lastRow, s.col)))) }))
            .sort((a, b) => a.y - b.y);
          for (let i = 1; i < tags.length; i++) if (tags[i].y - tags[i - 1].y < 12) tags[i].y = tags[i - 1].y + 12;
          const over = tags.length ? tags[tags.length - 1].y - (bottom - 2) : 0;
          if (over > 0) tags.forEach((tg) => (tg.y -= over));
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          for (const tg of tags) {
            ctx.fillStyle = pal[tg.s.key];
            ctx.beginPath();
            ctx.arc(Math.min(xEnd, LEFT + plotW) + 7, tg.y, 3.5, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillStyle = pal.text2;
            ctx.fillText(tg.s.label, Math.min(xEnd, LEFT + plotW) + 14, tg.y);
          }
        }

        // crosshair
        if (hoverRow >= 0) {
          const hx = Math.round(xOf(store.at(hoverRow, 0))) + 0.5;
          ctx.strokeStyle = pal.text2;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(hx, top);
          ctx.lineTo(hx, bottom);
          ctx.stroke();
          for (const s of panel.series) {
            const v = store.at(hoverRow, s.col);
            if (v < panel.min || v > panel.max) continue;
            ctx.fillStyle = pal[s.key];
            ctx.strokeStyle = pal.surface;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(hx, yOf(v), 4, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
          }
        }
        y = bottom;
      });

      // marker labels along the top of the first panel
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillStyle = pal.text2;
      let lastLabelEnd = -Infinity;
      for (const mk of store.markers) {
        if (mk.t < t0) continue;
        const mx = xOf(mk.t) + 4;
        if (mx < lastLabelEnd + 6) continue;
        ctx.fillText(mk.label, mx, TOP + GAP - 6);
        lastLabelEnd = mx + ctx.measureText(mk.label).width;
      }

      // time axis
      ctx.fillStyle = pal.muted;
      ctx.textBaseline = "top";
      ctx.textAlign = "center";
      const step = windowMs > 3000 ? 1000 : 500;
      for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
        ctx.fillText(`${(t / 1000).toFixed(step < 1000 ? 1 : 0)} s`, xOf(t), h - BOTTOM + 5);
      }

      const el = readoutRef.current;
      if (el) {
        if (hoverRow >= 0) {
          const g = (c: number, d: number) => store.at(hoverRow, c).toFixed(d);
          el.textContent = `t = ${(store.at(hoverRow, 0) / 1000).toFixed(3)} s   V ${g(1, 1)} mV   m ${g(2, 3)}   h ${g(3, 3)}   n ${g(4, 3)}   i_Na ${g(5, 1)}   i_K ${g(6, 1)}   i_Leak ${g(7, 1)} µA/cm²`;
        } else {
          el.textContent = "Hover the plot to read values at a moment in time.";
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [store, theme, windowMs]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="ts-canvas"
        role="img"
        aria-label="Stacked time series of membrane potential, gating variables and ionic currents"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - r.left;
          hoverX.current = x >= LEFT && x <= r.width - RIGHT ? x : null;
        }}
        onMouseLeave={() => (hoverX.current = null)}
      />
      <div ref={readoutRef} className="hm-readout mono" style={{ whiteSpace: "pre-wrap" }} />
    </div>
  );
}
