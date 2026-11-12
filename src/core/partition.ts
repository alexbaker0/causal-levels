/**
 * Search over coarse-grainings (set partitions of the state space) for the
 * one whose macro transition matrix has maximum effective information.
 */
import {
  type Matrix,
  type Partition,
  canonicalPartition,
  coarseGrain,
  effectiveInformation,
  groupCount,
} from "./ei";

export const EXHAUSTIVE_LIMIT = 10;

/** Ties in EI closer than this are treated as equal (and the finer scale kept). */
const TIE_EPS = 1e-9;

export interface SearchResult {
  partition: Partition;
  ei: number;
  method: "exhaustive" | "greedy";
  /** number of candidate partitions evaluated */
  evaluated: number;
}

/**
 * All set partitions of {0..n-1} as restricted-growth strings: a[0] = 0 and
 * a[i] <= 1 + max(a[0..i-1]). The same array is reused between yields.
 */
export function* setPartitions(n: number): Generator<number[]> {
  if (n <= 0) return;
  const a = new Array<number>(n).fill(0);
  const m = new Array<number>(n).fill(0); // m[i] = max(a[0..i])
  for (;;) {
    yield a;
    let i = n - 1;
    while (i > 0 && a[i] === m[i - 1] + 1) i--;
    if (i === 0) return;
    a[i]++;
    m[i] = Math.max(m[i - 1], a[i]);
    for (let j = i + 1; j < n; j++) {
      a[j] = 0;
      m[j] = m[i];
    }
  }
}

/** Bell number B(n): how many set partitions an n-set has. */
export function bellNumber(n: number): number {
  let row = [1];
  for (let i = 1; i <= n; i++) {
    const next = [row[row.length - 1]];
    for (let j = 0; j < row.length; j++) next.push(next[j] + row[j]);
    row = next;
  }
  return row[0];
}

/** True if (ei, groups) should replace the incumbent: higher EI, or equal EI at a finer grain. */
function better(ei: number, groups: number, bestEi: number, bestGroups: number): boolean {
  if (ei > bestEi + TIE_EPS) return true;
  return ei > bestEi - TIE_EPS && groups > bestGroups;
}

/** Evaluate every set partition. Feasible up to about n = 10 (B(10) = 115,975). */
export function exhaustiveSearch(T: Matrix): SearchResult {
  const n = T.length;
  let best: number[] = Array.from({ length: n }, (_, i) => i);
  let bestEi = effectiveInformation(T);
  let bestGroups = n;
  let evaluated = 0;
  for (const p of setPartitions(n)) {
    evaluated++;
    const k = Math.max(...p) + 1;
    const ei = effectiveInformation(coarseGrain(T, p));
    if (better(ei, k, bestEi, bestGroups)) {
      best = p.slice();
      bestEi = ei;
      bestGroups = k;
    }
  }
  return { partition: canonicalPartition(best), ei: bestEi, method: "exhaustive", evaluated };
}

/**
 * Greedy agglomeration: start from the micro scale and repeatedly merge the
 * pair of groups whose merger gives the highest macro EI, all the way down to
 * a single group. The best partition seen anywhere along that path is
 * returned, so a merge that only pays off after a later one is not missed.
 */
export function greedySearch(T: Matrix): SearchResult {
  const n = T.length;
  let current: number[] = Array.from({ length: n }, (_, i) => i);
  let best = current.slice();
  let bestEi = effectiveInformation(T);
  let bestGroups = n;
  let evaluated = 1;
  for (let k = n; k > 1; k--) {
    let stepEi = -Infinity;
    let stepPartition: number[] | null = null;
    for (let a = 0; a < k; a++) {
      for (let b = a + 1; b < k; b++) {
        const candidate = canonicalPartition(current.map((g) => (g === b ? a : g)));
        const ei = effectiveInformation(coarseGrain(T, candidate));
        evaluated++;
        if (ei > stepEi + TIE_EPS) {
          stepEi = ei;
          stepPartition = candidate;
        }
      }
    }
    current = stepPartition!;
    if (better(stepEi, k - 1, bestEi, bestGroups)) {
      best = current.slice();
      bestEi = stepEi;
      bestGroups = k - 1;
    }
  }
  return { partition: canonicalPartition(best), ei: bestEi, method: "greedy", evaluated };
}

/** Exhaustive for n <= 10, greedy merge above that. */
export function findBestPartition(T: Matrix): SearchResult {
  return T.length <= EXHAUSTIVE_LIMIT ? exhaustiveSearch(T) : greedySearch(T);
}

export { groupCount };
