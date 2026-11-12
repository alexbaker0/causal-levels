import type { Matrix } from "../../core/ei";

interface Props {
  matrix: Matrix;
  labels: string[];
  colors: string[];
  size?: number;
}

const MIN_P = 0.01;

/** Circular state-transition diagram. Edge weight and opacity scale with probability. */
export function TransitionGraph({ matrix, labels, colors, size = 300 }: Props) {
  const n = matrix.length;
  const c = size / 2;
  const nodeR = n > 9 ? 11 : 14;
  const loopR = nodeR * 0.75;
  const ringR = n === 1 ? 0 : c - nodeR - 2 * loopR - 6;
  const pos = Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    return { x: c + ringR * Math.cos(a), y: c + ringR * Math.sin(a), a };
  });
  const markerId = `arrow-${n}-${size}`;

  const edges: JSX.Element[] = [];
  const loops: JSX.Element[] = [];
  matrix.forEach((row, i) =>
    row.forEach((p, j) => {
      if (p < MIN_P) return;
      const style = { opacity: 0.18 + 0.82 * p, strokeWidth: 0.8 + 2.4 * p };
      const title = `${labels[i]} → ${labels[j]}: ${p.toFixed(3)}`;
      if (i === j) {
        const { x, y, a } = pos[i];
        const d = nodeR + loopR * 0.55;
        loops.push(
          <circle key={`l${i}`} cx={x + d * Math.cos(a)} cy={y + d * Math.sin(a)} r={loopR} fill="none" stroke="var(--text-2)" style={style}>
            <title>{title}</title>
          </circle>,
        );
        return;
      }
      const A = pos[i];
      const B = pos[j];
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const len = Math.hypot(dx, dy);
      // bow each edge to its left so i->j and j->i do not overlap
      const bend = 0.14 * len;
      const qx = (A.x + B.x) / 2 - (dy / len) * bend;
      const qy = (A.y + B.y) / 2 + (dx / len) * bend;
      const trim = (from: { x: number; y: number }, r: number) => {
        const vx = qx - from.x;
        const vy = qy - from.y;
        const l = Math.hypot(vx, vy);
        return { x: from.x + (vx / l) * r, y: from.y + (vy / l) * r };
      };
      const s = trim(A, nodeR + 1);
      const e = trim(B, nodeR + 5);
      edges.push(
        <path
          key={`e${i}-${j}`}
          d={`M${s.x.toFixed(1)} ${s.y.toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`}
          fill="none"
          stroke="var(--text-2)"
          markerEnd={`url(#${markerId})`}
          style={style}
        >
          <title>{title}</title>
        </path>,
      );
    }),
  );

  return (
    <svg className="graph-svg" viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`State transition graph with ${n} nodes`}>
      <defs>
        <marker id={markerId} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M0 0.5 L7 4 L0 7.5 z" fill="var(--text-2)" />
        </marker>
      </defs>
      {loops}
      {edges}
      {pos.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={nodeR} fill="var(--surface)" stroke={colors[i]} strokeWidth={3} />
          <text x={p.x} y={p.y + 4} textAnchor="middle" fill="var(--text)">
            {labels[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}
