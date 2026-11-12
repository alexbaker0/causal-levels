/**
 * Effective information (EI) of a discrete Markov chain, after
 * Hoel, Albantakis & Tononi (2013), "Quantifying causal emergence shows that
 * macro can beat micro", PNAS 110(49):19790-19795.
 *
 * T is an n x n row-stochastic matrix; T[i][j] = P(next = j | do(current = i)).
 * Interventions are uniform over the n states (maximum entropy). Logs base 2.
 */

export type Matrix = number[][];

export interface CausalStats {
  /** number of states */
  n: number;
  /** log2(n): the upper bound on EI, in bits */
  capacity: number;
  /** EI = determinism - degeneracy, in bits */
  ei: number;
  /** log2(n) - mean_i H(T_i), in bits */
  determinism: number;
  /** log2(n) - H(Tbar), in bits */
  degeneracy: number;
  /** each of the above divided by log2(n) (0 when n = 1) */
  eiNorm: number;
  determinismNorm: number;
  degeneracyNorm: number;
}

/** Shannon entropy in bits, with 0 log 0 = 0. */
export function entropy(p: readonly number[]): number {
  let h = 0;
  for (const x of p) if (x > 0) h -= x * Math.log2(x);
  return h;
}

/** KL(p || q) in bits. Infinite if p has mass where q has none. */
export function klDivergence(p: readonly number[], q: readonly number[]): number {
  let d = 0;
  for (let j = 0; j < p.length; j++) {
    if (p[j] > 0) {
      if (q[j] <= 0) return Infinity;
      d += p[j] * Math.log2(p[j] / q[j]);
    }
  }
  return d;
}

/** Tbar = (1/n) sum_i T_i: the effect distribution under uniform interventions. */
export function meanRow(T: Matrix): number[] {
  const n = T.length;
  const out = new Array<number>(n).fill(0);
  for (const row of T) for (let j = 0; j < n; j++) out[j] += row[j] / n;
  return out;
}

export function meanRowEntropy(T: Matrix): number {
  let s = 0;
  for (const row of T) s += entropy(row);
  return s / T.length;
}

/** EI by its definition: mean KL divergence of each row from the mean row. */
export function effectiveInformationKL(T: Matrix): number {
  const tbar = meanRow(T);
  let s = 0;
  for (const row of T) s += klDivergence(row, tbar);
  return s / T.length;
}

/** EI = H(Tbar) - mean_i H(T_i). */
export function effectiveInformation(T: Matrix): number {
  return entropy(meanRow(T)) - meanRowEntropy(T);
}

export function determinism(T: Matrix): number {
  return Math.log2(T.length) - meanRowEntropy(T);
}

export function degeneracy(T: Matrix): number {
  return Math.log2(T.length) - entropy(meanRow(T));
}

export function causalStats(T: Matrix): CausalStats {
  const n = T.length;
  const capacity = Math.log2(n);
  const det = determinism(T);
  const deg = degeneracy(T);
  const ei = det - deg;
  const norm = (x: number) => (capacity > 0 ? x / capacity : 0);
  return {
    n,
    capacity,
    ei,
    determinism: det,
    degeneracy: deg,
    eiNorm: norm(ei),
    determinismNorm: norm(det),
    degeneracyNorm: norm(deg),
  };
}

/* ---------- matrix helpers ---------- */

export function isRowStochastic(T: Matrix, tol = 1e-9): boolean {
  const n = T.length;
  return T.every(
    (row) =>
      row.length === n &&
      row.every((x) => x >= -tol && Number.isFinite(x)) &&
      Math.abs(row.reduce((a, b) => a + b, 0) - 1) <= tol,
  );
}

/** Scale a non-negative row to sum to 1. An all-zero row becomes uniform. */
export function normaliseRow(row: readonly number[]): number[] {
  const clean = row.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const s = clean.reduce((a, b) => a + b, 0);
  if (s <= 0) return clean.map(() => 1 / clean.length);
  return clean.map((x) => x / s);
}

/**
 * Set one entry of a stochastic row to `value` (clamped to [0,1]) and rescale
 * the other entries proportionally so the row still sums to 1. If the other
 * entries are all zero the remainder is spread evenly over them.
 */
export function setRowEntry(row: readonly number[], j: number, value: number): number[] {
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const n = row.length;
  if (n === 1) return [1];
  let rest = 0;
  for (let k = 0; k < n; k++) if (k !== j) rest += row[k];
  return row.map((x, k) => {
    if (k === j) return v;
    return rest > 0 ? (x * (1 - v)) / rest : (1 - v) / (n - 1);
  });
}

/* ---------- coarse-graining ---------- */

/**
 * A partition is an array of group labels, one per micro state. Canonical
 * form relabels groups 0,1,2,... in order of first appearance.
 */
export type Partition = number[];

export function canonicalPartition(labels: readonly number[]): Partition {
  const map = new Map<number, number>();
  return labels.map((l) => {
    if (!map.has(l)) map.set(l, map.size);
    return map.get(l)!;
  });
}

export function groupCount(labels: readonly number[]): number {
  return new Set(labels).size;
}

export function groupsOf(labels: readonly number[]): number[][] {
  const canon = canonicalPartition(labels);
  const groups: number[][] = [];
  canon.forEach((g, i) => (groups[g] ??= []).push(i));
  return groups;
}

/**
 * Macro transition matrix: P(G -> G') is the average over micro states i in G
 * of sum_{j in G'} T[i][j]. Macro states are ordered as in the canonical
 * partition.
 */
export function coarseGrain(T: Matrix, labels: readonly number[]): Matrix {
  const n = T.length;
  if (labels.length !== n) throw new Error("partition length must equal number of states");
  const canon = canonicalPartition(labels);
  const k = groupCount(canon);
  const size = new Array<number>(k).fill(0);
  const M: Matrix = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < n; i++) {
    size[canon[i]]++;
    const out = M[canon[i]];
    for (let j = 0; j < n; j++) out[canon[j]] += T[i][j];
  }
  for (let g = 0; g < k; g++) for (let h = 0; h < k; h++) M[g][h] /= size[g];
  return M;
}

/** EI(macro) - EI(micro), in bits. Positive means the macro scale wins. */
export function causalEmergence(T: Matrix, labels: readonly number[]): number {
  return effectiveInformation(coarseGrain(T, labels)) - effectiveInformation(T);
}
