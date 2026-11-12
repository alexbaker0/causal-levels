/** Example transition matrices for the causal-emergence demo. */
import { type Matrix, normaliseRow } from "./ei";

/** Small deterministic PRNG (mulberry32) so "random" is reproducible in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hoel et al. (2013) style example: the first n-1 states each go uniformly
 * to the first n-1 states; the last state goes to itself.
 */
export function hoelExample(n = 8): Matrix {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      i === n - 1 ? (j === n - 1 ? 1 : 0) : j === n - 1 ? 0 : 1 / (n - 1),
    ),
  );
}

/** Permutation matrix: state i goes to perm[i] with certainty. */
export function permutationMatrix(perm: readonly number[]): Matrix {
  const n = perm.length;
  return perm.map((target) => Array.from({ length: n }, (_, j) => (j === target ? 1 : 0)));
}

/** The cyclic shift i -> i+1 (mod n). */
export function cyclicPermutation(n = 8): Matrix {
  return permutationMatrix(Array.from({ length: n }, (_, i) => (i + 1) % n));
}

export function identicalRows(row: readonly number[]): Matrix {
  const r = normaliseRow(row);
  return r.map(() => r.slice());
}

/**
 * Noisy block chain: states come in blocks; block b moves to block b+1
 * (cyclically) with probability 1 - leak, landing on a noisy spread of states
 * inside the target block, and leaks uniformly everywhere otherwise.
 *
 * Unequal block sizes matter: with equal blocks and no leak the micro and
 * macro EI are both exactly log2(#blocks). Unequal blocks make the micro
 * effect distribution lopsided (degenerate), which the macro scale removes.
 */
export function noisyBlockChain(blockSizes: readonly number[] = [4, 3, 1], leak = 0.06, seed = 7): Matrix {
  const rand = mulberry32(seed);
  const n = blockSizes.reduce((a, b) => a + b, 0);
  const blockOf: number[] = [];
  blockSizes.forEach((s, b) => {
    for (let i = 0; i < s; i++) blockOf.push(b);
  });
  const k = blockSizes.length;
  return Array.from({ length: n }, (_, i) => {
    const target = (blockOf[i] + 1) % k;
    const within = normaliseRow(Array.from({ length: n }, (_, j) => (blockOf[j] === target ? 0.5 + rand() : 0)));
    return within.map((w) => (1 - leak) * w + leak / n);
  });
}

/** Random row-stochastic matrix; `sparsity` is the chance an entry is zeroed. */
export function randomMatrix(n: number, rand: () => number = Math.random, sparsity = 0.5): Matrix {
  return Array.from({ length: n }, () =>
    normaliseRow(Array.from({ length: n }, () => (rand() < sparsity ? 0 : rand() ** 2))),
  );
}
