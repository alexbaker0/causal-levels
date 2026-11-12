import type { Theme } from "../../theme";

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;

/** One-hue sequential ramp (blue). Light mode runs light->dark, dark mode dark->light. */
const RAMP: Record<Theme, [number, RGB][]> = {
  light: [
    [0, hex("#f1f5fa")],
    [0.12, hex("#cde2fb")],
    [0.5, hex("#5598e7")],
    [1, hex("#0d366b")],
  ],
  dark: [
    [0, hex("#20242a")],
    [0.12, hex("#0d366b")],
    [0.5, hex("#2a78d6")],
    [1, hex("#cde2fb")],
  ],
};

export function probabilityColor(p: number, theme: Theme): { fill: string; ink: string } {
  const stops = RAMP[theme];
  const t = Math.min(1, Math.max(0, p));
  let k = 1;
  while (k < stops.length - 1 && t > stops[k][0]) k++;
  const [t0, c0] = stops[k - 1];
  const [t1, c1] = stops[k];
  const u = (t - t0) / (t1 - t0);
  const c = c0.map((v, i) => Math.round(v + (c1[i] - v) * u));
  const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  return { fill: `rgb(${c[0]},${c[1]},${c[2]})`, ink: lum > 0.55 ? "#0b0b0b" : "#ffffff" };
}

/** Group identity colour: eight fixed categorical slots, neutral beyond that (the letter still identifies it). */
export function groupColor(id: number): string {
  return id < 8 ? `var(--s${id + 1})` : "var(--s-neutral)";
}

export function groupLetter(id: number): string {
  return String.fromCharCode(65 + id);
}

export function formatProb(p: number): string {
  if (p <= 0) return "";
  if (p >= 0.995) return "1";
  if (p < 0.005) return "<.01";
  return p.toFixed(2).replace(/^0/, "");
}
