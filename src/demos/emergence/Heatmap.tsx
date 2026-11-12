import { useState } from "react";
import type { Matrix } from "../../core/ei";
import type { Theme } from "../../theme";
import { formatProb, probabilityColor } from "./colors";

interface Props {
  matrix: Matrix;
  /** label per state (row and column) */
  labels: string[];
  /** identity colour per state, drawn as a tag beside the label */
  tagColors: string[];
  theme: Theme;
  /** noun used in the hover readout, e.g. "state" or "group" */
  noun: string;
  onEdit?: (i: number, j: number, value: number) => void;
  onTagClick?: (i: number) => void;
  maxSize?: number;
}

const HEAD = 34;

/** Square heatmap of a transition matrix: rows are "from", columns are "to". */
export function Heatmap({ matrix, labels, tagColors, theme, noun, onEdit, onTagClick, maxSize = 336 }: Props) {
  const n = matrix.length;
  const cell = Math.max(24, Math.min(54, Math.floor(maxSize / n)));
  const size = n * cell;
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [edit, setEdit] = useState<{ i: number; j: number; text: string } | null>(null);

  const commit = () => {
    if (!edit) return;
    const v = parseFloat(edit.text);
    if (Number.isFinite(v) && onEdit) onEdit(edit.i, edit.j, v);
    setEdit(null);
  };

  const h = hover && hover[0] < n && hover[1] < n ? hover : null;

  return (
    <div>
      <div className="heatmap-wrap">
        <svg
          width={HEAD + size + 2}
          height={HEAD + size + 2}
          role="img"
          aria-label={`Transition matrix heatmap, ${n} by ${n}`}
          onMouseLeave={() => setHover(null)}
        >
          <text x={HEAD + size / 2} y={9} textAnchor="middle" fill="var(--muted)" style={{ fontSize: 10 }}>
            to →
          </text>
          <text
            transform={`translate(8 ${HEAD + size / 2}) rotate(-90)`}
            textAnchor="middle"
            fill="var(--muted)"
            style={{ fontSize: 10 }}
          >
            from →
          </text>
          {labels.map((lab, i) => (
            <g key={`h${i}`}>
              {/* column header */}
              <rect x={HEAD + i * cell + cell / 2 - 7} y={HEAD - 6} width={14} height={3} rx={1.5} fill={tagColors[i]} />
              <text x={HEAD + i * cell + cell / 2} y={HEAD - 10} textAnchor="middle" fill="var(--text-2)">
                {lab}
              </text>
              {/* row header */}
              <g
                onClick={onTagClick ? () => onTagClick(i) : undefined}
                style={onTagClick ? { cursor: "pointer" } : undefined}
              >
                {onTagClick && <title>Click to move this state to the next group</title>}
                <rect x={12} y={HEAD + i * cell + 1} width={HEAD - 14} height={cell - 2} fill="transparent" />
                <rect x={HEAD - 7} y={HEAD + i * cell + cell / 2 - 7} width={3} height={14} rx={1.5} fill={tagColors[i]} />
                <text x={HEAD - 11} y={HEAD + i * cell + cell / 2 + 4} textAnchor="end" fill="var(--text-2)">
                  {lab}
                </text>
              </g>
            </g>
          ))}
          {matrix.map((row, i) =>
            row.map((p, j) => {
              const { fill, ink } = probabilityColor(p, theme);
              const x = HEAD + j * cell;
              const y = HEAD + i * cell;
              return (
                <g
                  key={`${i}-${j}`}
                  onMouseEnter={() => setHover([i, j])}
                  onClick={onEdit ? () => setEdit({ i, j, text: String(+p.toFixed(3)) }) : undefined}
                  style={onEdit ? { cursor: "text" } : undefined}
                >
                  <rect x={x + 1} y={y + 1} width={cell - 2} height={cell - 2} rx={3} fill={fill} />
                  {cell >= 24 && (
                    <text
                      x={x + cell / 2}
                      y={y + cell / 2 + 4}
                      textAnchor="middle"
                      fill={ink}
                      style={{ fontSize: cell < 30 ? 9.5 : 11 }}
                    >
                      {formatProb(p)}
                    </text>
                  )}
                </g>
              );
            }),
          )}
          {h && (
            <rect
              x={HEAD + h[1] * cell + 1}
              y={HEAD + h[0] * cell + 1}
              width={cell - 2}
              height={cell - 2}
              rx={3}
              fill="none"
              stroke="var(--text)"
              strokeWidth={1.5}
              pointerEvents="none"
            />
          )}
        </svg>
        {edit && (
          <input
            className="cell-edit"
            autoFocus
            type="text"
            inputMode="decimal"
            aria-label={`Probability from ${labels[edit.i]} to ${labels[edit.j]}`}
            value={edit.text}
            style={{
              left: HEAD + edit.j * cell - 4,
              top: HEAD + edit.i * cell + 1,
              width: cell + 8,
              height: cell - 2,
            }}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setEdit({ ...edit, text: e.target.value })}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEdit(null);
            }}
          />
        )}
      </div>
      <div className="hm-readout mono">
        {h ? (
          <>
            P({noun} {labels[h[0]]} → {noun} {labels[h[1]]}) = <b>{matrix[h[0]][h[1]].toFixed(4)}</b>
          </>
        ) : onEdit ? (
          "Click a cell to edit; the rest of its row rescales to sum to 1."
        ) : (
          "Hover a cell for its value."
        )}
      </div>
    </div>
  );
}
