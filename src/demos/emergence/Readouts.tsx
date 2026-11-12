import type { CausalStats } from "../../core/ei";

interface Props {
  micro: CausalStats;
  macro: CausalStats;
  normalised: boolean;
  onNormalised: (v: boolean) => void;
}

const MICRO = "var(--s1)";
const MACRO = "var(--s2)";

function fmt(x: number): string {
  const v = Math.abs(x) < 5e-7 ? 0 : x;
  return v.toFixed(3);
}

function Metric(props: { name: string; hint: string; micro: number; macro: number; max: number; unit: string }) {
  const pct = (v: number) => `${Math.max(0, Math.min(1, props.max > 0 ? v / props.max : 0)) * 100}%`;
  return (
    <div className="metric">
      <div className="metric-name">
        {props.name}
        <span className="note">{props.hint}</span>
      </div>
      {(
        [
          ["micro", props.micro, MICRO],
          ["macro", props.macro, MACRO],
        ] as const
      ).map(([scale, v, color]) => (
        <div className="bar-row" key={scale}>
          <span>{scale}</span>
          <div className="bar-track" title={`${props.name}, ${scale}: ${fmt(v)}${props.unit}`}>
            <div className="bar-fill" style={{ width: pct(v), background: color }} />
          </div>
          <span className="bar-val">
            {fmt(v)}
            {props.unit}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Readouts({ micro, macro, normalised, onNormalised }: Props) {
  const ce = normalised ? macro.eiNorm - micro.eiNorm : macro.ei - micro.ei;
  const unit = normalised ? "" : " b";
  const max = normalised ? 1 : micro.capacity;
  const verdict =
    macro.n === micro.n
      ? "No coarse-graining yet: every state is its own group."
      : ce > 1e-9
        ? "Causal emergence: the macro scale carries more effective information."
        : ce < -1e-9
          ? "Causal reduction: this grouping throws away causal information."
          : "No difference between the two scales.";
  const pick = (s: CausalStats) =>
    normalised
      ? { det: s.determinismNorm, deg: s.degeneracyNorm, ei: s.eiNorm }
      : { det: s.determinism, deg: s.degeneracy, ei: s.ei };
  const a = pick(micro);
  const b = pick(macro);

  return (
    <section className="card readouts">
      <h2>Causal emergence = EI(macro) − EI(micro)</h2>
      <div className="ce-headline">
        <span className="ce-value">
          {ce > 5e-7 ? "+" : ""}
          {fmt(ce)}
          {normalised ? "" : " bits"}
        </span>
        <span className="ce-verdict">{verdict}</span>
      </div>
      <div className="legend" style={{ marginBottom: 8 }}>
        <span>
          <i className="swatch" style={{ background: MICRO }} />
          micro ({micro.n} states)
        </span>
        <span>
          <i className="swatch" style={{ background: MACRO }} />
          macro ({macro.n} {macro.n === 1 ? "group" : "groups"})
        </span>
        <label style={{ marginLeft: "auto" }}>
          <input type="checkbox" checked={normalised} onChange={(e) => onNormalised(e.target.checked)} /> normalise by
          log₂ n
        </label>
      </div>
      <Metric name="Effective information" hint="determinism − degeneracy" micro={a.ei} macro={b.ei} max={max} unit={unit} />
      <Metric name="Determinism" hint="how reliably a state picks its successor" micro={a.det} macro={b.det} max={max} unit={unit} />
      <Metric name="Degeneracy" hint="how much different states converge" micro={a.deg} macro={b.deg} max={max} unit={unit} />
      <p className="note" style={{ margin: 0 }}>
        {normalised
          ? "Each value is divided by log₂ of that scale's own number of states, so bars run 0 to 1."
          : `Bars share one scale, 0 to log₂ ${micro.n} = ${micro.capacity.toFixed(3)} bits. The macro ceiling is log₂ ${macro.n} = ${macro.capacity.toFixed(3)} bits.`}
      </p>
    </section>
  );
}
