import { useMemo, useState } from "react";
import { type Matrix, canonicalPartition, causalStats, coarseGrain, setRowEntry } from "../../core/ei";
import { EXHAUSTIVE_LIMIT, type SearchResult, bellNumber, findBestPartition } from "../../core/partition";
import { blockSizesFor, cyclicPermutation, hoelExample, noisyBlockChain, randomMatrix } from "../../core/presets";
import type { Theme } from "../../theme";
import { GroupEditor, cycleGroup, groupOrder } from "./GroupEditor";
import { Heatmap } from "./Heatmap";
import { Readouts } from "./Readouts";
import { TransitionGraph } from "./TransitionGraph";
import { groupColor, groupLetter } from "./colors";

type PresetId = "hoel" | "permutation" | "blocks" | "random";

const PRESETS: { id: PresetId; label: string; minN: number; about: string }[] = [
  {
    id: "hoel",
    label: "Hoel example",
    minN: 3,
    about:
      "All states but the last hop uniformly among themselves; the last maps to itself. The micro scale is noisy, yet a two-group macro scale is a perfectly deterministic 1-bit system.",
  },
  {
    id: "permutation",
    label: "Permutation",
    minN: 2,
    about:
      "Each state goes to exactly one other and none converge. EI is already at its ceiling of log₂ n, so every coarse-graining loses information: the micro scale wins.",
  },
  {
    id: "blocks",
    label: "Noisy blocks",
    minN: 4,
    about:
      "States sit in blocks of unequal size. Each block moves to the next, landing somewhere noisy inside it, with a small leak to everywhere. Grouping by block recovers a nearly deterministic cycle.",
  },
  {
    id: "random",
    label: "Random",
    minN: 2,
    about: "A random sparse stochastic matrix. Press Random again for a new one. Most have little to gain from grouping.",
  },
];

const MAX_N = 12;

function build(id: PresetId, n: number): Matrix {
  switch (id) {
    case "hoel":
      return hoelExample(n);
    case "permutation":
      return cyclicPermutation(n);
    case "blocks":
      return noisyBlockChain(blockSizesFor(n));
    case "random":
      return randomMatrix(n);
  }
}

const singletons = (n: number) => Array.from({ length: n }, (_, i) => i);

export function EmergenceDemo({ theme }: { theme: Theme }) {
  const [preset, setPreset] = useState<PresetId>("hoel");
  const [T, setT] = useState<Matrix>(() => hoelExample(8));
  const [labels, setLabels] = useState<number[]>(() => singletons(8));
  const [normalised, setNormalised] = useState(false);
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const n = T.length;

  const load = (id: PresetId, size: number) => {
    const meta = PRESETS.find((p) => p.id === id)!;
    const m = Math.max(meta.minN, size);
    setPreset(id);
    setT(build(id, m));
    setLabels(singletons(m));
    setSearch(null);
  };

  const applyLabels = (next: number[]) => {
    setLabels(next);
    setSearch(null);
  };

  const order = useMemo(() => groupOrder(labels), [labels]);
  const macro = useMemo(() => coarseGrain(T, labels), [T, labels]);
  const microStats = useMemo(() => causalStats(T), [T]);
  const macroStats = useMemo(() => causalStats(macro), [macro]);

  const runSearch = () => {
    setBusy(true);
    // let the "searching" state paint before the synchronous search
    setTimeout(() => {
      const res = findBestPartition(T);
      setLabels(res.partition);
      setSearch(res);
      setBusy(false);
    }, 20);
  };

  const microLabels = singletons(n).map((i) => String(i + 1));
  const microColors = labels.map(groupColor);
  const macroLabels = order.map(groupLetter);
  const macroColors = order.map(groupColor);
  const about = PRESETS.find((p) => p.id === preset)!.about;
  const isMicro = canonicalPartition(labels).every((g, i) => g === i);

  return (
    <div>
      <p className="intro">
        A Markov chain is described twice: state by state (micro), and after lumping states into groups (macro).
        Effective information (EI) measures how much an intervention on the current state tells you about the next
        one. When the macro description has higher EI than the micro one, the higher level is the better causal
        model (Hoel, Albantakis &amp; Tononi 2013).
      </p>

      <div className="toolbar">
        {PRESETS.map((p) => (
          <button key={p.id} className={preset === p.id ? "active" : ""} onClick={() => load(p.id, n)}>
            {p.label}
          </button>
        ))}
        <label>
          States
          <select value={n} onChange={(e) => load(preset, Number(e.target.value))}>
            {Array.from({ length: MAX_N - 1 }, (_, i) => i + 2).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <span className="sep" />
        <button className="primary" onClick={runSearch} disabled={busy}>
          {busy ? "Searching…" : "Find best partition"}
        </button>
        <button onClick={() => applyLabels(singletons(n))} disabled={isMicro}>
          Ungroup all
        </button>
        <span className="note">
          {search
            ? `${search.method === "exhaustive" ? "Exhaustive" : "Greedy merge"} search checked ${search.evaluated.toLocaleString()} partitions; best EI ${search.ei.toFixed(3)} bits${
                search.partition.every((g, i) => g === i) ? " (the micro scale itself)" : ""
              }.`
            : n <= EXHAUSTIVE_LIMIT
              ? `Exhaustive over all ${bellNumber(n).toLocaleString()} partitions.`
              : `Greedy merge (n > ${EXHAUSTIVE_LIMIT}: too many partitions to enumerate).`}
        </span>
      </div>

      <p className="note" style={{ margin: "0 0 10px", maxWidth: "110ch" }}>
        {about}
      </p>

      <GroupEditor labels={labels} onChange={applyLabels} />

      <div className="em-grid">
        <section className="card">
          <h2>Micro transition matrix</h2>
          <p className="sub">{n} states. Click a row label to change its group.</p>
          <Heatmap
            matrix={T}
            labels={microLabels}
            tagColors={microColors}
            theme={theme}
            noun="state"
            onEdit={(i, j, v) => {
              setT(T.map((row, r) => (r === i ? setRowEntry(row, j, v) : row)));
              setSearch(null);
            }}
            onTagClick={(i) => applyLabels(cycleGroup(labels, i))}
          />
        </section>
        <section className="card">
          <h2>Macro transition matrix</h2>
          <p className="sub">
            {order.length} {order.length === 1 ? "group" : "groups"}. Each row averages its member states.
          </p>
          <Heatmap matrix={macro} labels={macroLabels} tagColors={macroColors} theme={theme} noun="group" maxSize={280} />
        </section>
        <Readouts micro={microStats} macro={macroStats} normalised={normalised} onNormalised={setNormalised} />
      </div>

      <div className="em-graphs">
        <section className="card">
          <h2>Micro state-transition graph</h2>
          <p className="sub">Ring colour is the state's group. Fainter arrows are less likely transitions.</p>
          <TransitionGraph matrix={T} labels={microLabels} colors={microColors} size={300} />
        </section>
        <section className="card">
          <h2>Macro state-transition graph</h2>
          <p className="sub">One node per group.</p>
          <TransitionGraph matrix={macro} labels={macroLabels} colors={macroColors} size={300} />
        </section>
      </div>
    </div>
  );
}
