import { describe, expect, it } from "vitest";
import {
  causalEmergence,
  causalStats,
  coarseGrain,
  degeneracy,
  determinism,
  effectiveInformation,
  effectiveInformationKL,
  entropy,
  isRowStochastic,
  klDivergence,
  meanRow,
  normaliseRow,
  setRowEntry,
} from "./ei";
import {
  bellNumber,
  exhaustiveSearch,
  findBestPartition,
  greedySearch,
  setPartitions,
} from "./partition";
import {
  cyclicPermutation,
  hoelExample,
  identicalRows,
  mulberry32,
  noisyBlockChain,
  permutationMatrix,
  randomMatrix,
} from "./presets";

describe("entropy and KL", () => {
  it("handles the basic cases", () => {
    expect(entropy([1, 0, 0])).toBe(0);
    expect(entropy([0.5, 0.5])).toBeCloseTo(1, 12);
    expect(entropy([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(2, 12);
    expect(klDivergence([0.5, 0.5], [0.5, 0.5])).toBe(0);
    expect(klDivergence([1, 0], [0.5, 0.5])).toBeCloseTo(1, 12);
    expect(klDivergence([1, 0], [0, 1])).toBe(Infinity);
  });
});

describe("Hoel 8-state example", () => {
  const T = hoelExample(8);
  const grouping = [0, 0, 0, 0, 0, 0, 0, 1];

  it("is row-stochastic", () => {
    expect(isRowStochastic(T)).toBe(true);
  });

  it("has micro EI of about 0.544 bits", () => {
    // H(Tbar) with Tbar = (1/8,...,1/8) is 3 bits; mean row entropy is (7/8) log2 7.
    expect(effectiveInformation(T)).toBeCloseTo(3 - (7 / 8) * Math.log2(7), 12);
    expect(effectiveInformation(T)).toBeCloseTo(0.544, 3);
    expect(effectiveInformationKL(T)).toBeCloseTo(0.544, 3);
  });

  it("coarse-grains {1..7},{8} to the 2-state identity with EI = 1 bit exactly", () => {
    const M = coarseGrain(T, grouping);
    expect(M.length).toBe(2);
    expect(M[0][0]).toBeCloseTo(1, 12);
    expect(M[0][1]).toBeCloseTo(0, 12);
    expect(M[1]).toEqual([0, 1]);
    expect(effectiveInformation(M)).toBeCloseTo(1, 12);
    expect(causalEmergence(T, grouping)).toBeCloseTo(1 - 0.5436, 3);
  });

  it("exhaustive search finds that grouping", () => {
    const res = exhaustiveSearch(T);
    expect(res.method).toBe("exhaustive");
    expect(res.evaluated).toBe(bellNumber(8));
    expect(res.partition).toEqual(grouping);
    expect(res.ei).toBeCloseTo(1, 12);
  });

  it("greedy search reaches the same EI", () => {
    expect(greedySearch(T).ei).toBeCloseTo(1, 12);
  });
});

describe("permutation matrices", () => {
  it.each([2, 3, 5, 8])("n = %i: EI = log2(n) and no coarse-graining beats it", (n) => {
    const rand = mulberry32(n);
    // random permutation by Fisher-Yates
    const perm = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (const T of [permutationMatrix(perm), cyclicPermutation(n)]) {
      const micro = effectiveInformation(T);
      expect(micro).toBeCloseTo(Math.log2(n), 12);
      const s = causalStats(T);
      expect(s.determinismNorm).toBeCloseTo(1, 12);
      expect(s.degeneracy).toBeCloseTo(0, 12);
      let maxMacro = -Infinity;
      for (const p of setPartitions(n)) {
        const k = Math.max(...p) + 1;
        if (k === n) continue;
        maxMacro = Math.max(maxMacro, effectiveInformation(coarseGrain(T, p)));
      }
      if (n > 1) expect(maxMacro).toBeLessThan(micro);
      const res = findBestPartition(T);
      expect(res.partition).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(res.ei).toBeCloseTo(micro, 12);
    }
  });
});

describe("identical rows", () => {
  it("has EI = 0", () => {
    const T = identicalRows([0.1, 0.2, 0.3, 0.4, 0]);
    expect(effectiveInformation(T)).toBeCloseTo(0, 12);
    expect(effectiveInformationKL(T)).toBeCloseTo(0, 12);
    const s = causalStats(T);
    expect(s.determinism).toBeCloseTo(s.degeneracy, 12);
  });
  it("uniform matrix has zero determinism and zero degeneracy", () => {
    const s = causalStats(identicalRows([1, 1, 1, 1]));
    expect(s.determinism).toBeCloseTo(0, 12);
    expect(s.degeneracy).toBeCloseTo(0, 12);
  });
});

describe("identities on random matrices", () => {
  const rand = mulberry32(12345);
  const cases = Array.from({ length: 200 }, (_, c) => randomMatrix(2 + (c % 11), rand, c % 3 === 0 ? 0 : 0.5));

  it("EI = determinism - degeneracy", () => {
    for (const T of cases) {
      expect(isRowStochastic(T)).toBe(true);
      expect(Math.abs(effectiveInformation(T) - (determinism(T) - degeneracy(T)))).toBeLessThan(1e-12);
      const s = causalStats(T);
      expect(Math.abs(s.eiNorm - (s.determinismNorm - s.degeneracyNorm))).toBeLessThan(1e-12);
    }
  });

  it("the KL form and the entropy form of EI agree", () => {
    for (const T of cases) {
      expect(Math.abs(effectiveInformation(T) - effectiveInformationKL(T))).toBeLessThan(1e-10);
    }
  });

  it("0 <= EI <= log2(n), and the mean row is a distribution", () => {
    for (const T of cases) {
      const ei = effectiveInformation(T);
      expect(ei).toBeGreaterThanOrEqual(-1e-12);
      expect(ei).toBeLessThanOrEqual(Math.log2(T.length) + 1e-12);
      expect(meanRow(T).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    }
  });

  it("coarse-graining keeps rows stochastic; trivial partitions behave", () => {
    for (const T of cases) {
      const n = T.length;
      const labels = Array.from({ length: n }, () => Math.floor(rand() * 3));
      expect(isRowStochastic(coarseGrain(T, labels))).toBe(true);
      const identity = Array.from({ length: n }, (_, i) => i);
      expect(causalEmergence(T, identity)).toBeCloseTo(0, 12);
      expect(effectiveInformation(coarseGrain(T, new Array(n).fill(0)))).toBe(0);
    }
  });
});

describe("partition search", () => {
  it("enumerates Bell(n) distinct partitions", () => {
    expect([1, 2, 3, 4, 5, 6].map(bellNumber)).toEqual([1, 2, 5, 15, 52, 203]);
    expect(bellNumber(10)).toBe(115975);
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      const seen = new Set<string>();
      for (const p of setPartitions(n)) seen.add(p.join(","));
      expect(seen.size).toBe(bellNumber(n));
    }
  });

  it("exhaustive result is never below micro EI or the greedy result", () => {
    const rand = mulberry32(99);
    for (let c = 0; c < 25; c++) {
      const T = randomMatrix(3 + (c % 5), rand);
      const ex = exhaustiveSearch(T);
      const gr = greedySearch(T);
      expect(ex.ei).toBeGreaterThanOrEqual(effectiveInformation(T) - 1e-12);
      expect(ex.ei).toBeGreaterThanOrEqual(gr.ei - 1e-9);
      expect(effectiveInformation(coarseGrain(T, ex.partition))).toBeCloseTo(ex.ei, 12);
      expect(effectiveInformation(coarseGrain(T, gr.partition))).toBeCloseTo(gr.ei, 12);
    }
  });

  it("recovers the blocks of the noisy block chain", () => {
    const T = noisyBlockChain([4, 3, 1]);
    const res = findBestPartition(T);
    expect(res.partition).toEqual([0, 0, 0, 0, 1, 1, 1, 2]);
    expect(res.ei).toBeGreaterThan(effectiveInformation(T));
  });

  it("uses greedy merge above n = 10 and still finds the blocks", () => {
    const T = noisyBlockChain([5, 4, 2, 1]);
    const res = findBestPartition(T);
    expect(res.method).toBe("greedy");
    expect(res.partition).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3]);
    expect(greedySearch(hoelExample(12)).ei).toBeCloseTo(1, 12);
  });

  it("runs the n = 10 exhaustive search", () => {
    const res = exhaustiveSearch(hoelExample(10));
    expect(res.evaluated).toBe(115975);
    expect(res.ei).toBeCloseTo(1, 12);
  });
});

describe("row editing helpers", () => {
  it("normaliseRow", () => {
    expect(normaliseRow([2, 2])).toEqual([0.5, 0.5]);
    expect(normaliseRow([0, 0, 0, 0])).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(normaliseRow([-1, NaN, 3])).toEqual([0, 0, 1]);
  });
  it("setRowEntry keeps the row stochastic", () => {
    const r = setRowEntry([0.5, 0.25, 0.25], 0, 0.8);
    expect(r[0]).toBe(0.8);
    expect(r[1]).toBeCloseTo(0.1, 12);
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(setRowEntry([1, 0, 0], 0, 0.4)).toEqual([0.4, 0.3, 0.3]);
    expect(setRowEntry([0.2, 0.8], 1, 5)).toEqual([0, 1]);
  });
});
