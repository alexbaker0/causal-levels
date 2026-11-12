import { cssVar } from "../../theme";

export interface Palette {
  surface: string;
  border: string;
  text: string;
  text2: string;
  muted: string;
  accent: string;
  V: string;
  m: string;
  h: string;
  n: string;
  iNa: string;
  iK: string;
  iLeak: string;
}

/** Resolve the CSS tokens once per theme change so canvas drawing can use them. */
export function readPalette(): Palette {
  return {
    surface: cssVar("--surface"),
    border: cssVar("--border"),
    text: cssVar("--text"),
    text2: cssVar("--text-2"),
    muted: cssVar("--muted"),
    accent: cssVar("--accent"),
    V: cssVar("--text"),
    m: cssVar("--s1"),
    h: cssVar("--s2"),
    n: cssVar("--s3"),
    iNa: cssVar("--s7"),
    iK: cssVar("--s4"),
    iLeak: cssVar("--s-neutral"),
  };
}

/** Size a canvas for the device pixel ratio; returns a context scaled to CSS pixels. */
export function fitCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export const FONT = "11px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
