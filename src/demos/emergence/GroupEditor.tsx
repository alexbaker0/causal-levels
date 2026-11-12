import { useState } from "react";
import { groupColor, groupLetter } from "./colors";

interface Props {
  /** group id per state; ids are stable so a group keeps its colour */
  labels: number[];
  onChange: (labels: number[]) => void;
}

/** Group ids in order of first appearance. */
export function groupOrder(labels: readonly number[]): number[] {
  return [...new Set(labels)];
}

function unusedId(labels: readonly number[]): number {
  const used = new Set(labels);
  let id = 0;
  while (used.has(id)) id++;
  return id;
}

/** Move state i to the next group in order; after the last group it gets a fresh one of its own. */
export function cycleGroup(labels: readonly number[], i: number): number[] {
  const order = groupOrder(labels);
  const alone = labels.filter((l) => l === labels[i]).length === 1;
  const options = alone ? order : [...order, unusedId(labels)];
  const next = options[(options.indexOf(labels[i]) + 1) % options.length];
  return labels.map((l, k) => (k === i ? next : l));
}

/** Buckets of state chips: drag a chip to another bucket, or click it to cycle its group. */
export function GroupEditor({ labels, onChange }: Props) {
  const [over, setOver] = useState<number | "new" | null>(null);
  const order = groupOrder(labels);
  const n = labels.length;

  const drop = (e: React.DragEvent, target: number | "new") => {
    e.preventDefault();
    setOver(null);
    const i = Number(e.dataTransfer.getData("text/plain"));
    if (!Number.isInteger(i) || i < 0 || i >= n) return;
    const id = target === "new" ? unusedId(labels) : target;
    if (labels[i] !== id) onChange(labels.map((l, k) => (k === i ? id : l)));
  };

  const dropProps = (target: number | "new") => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(target);
    },
    onDragLeave: () => setOver((o) => (o === target ? null : o)),
    onDrop: (e: React.DragEvent) => drop(e, target),
  });

  return (
    <div className="groups" aria-label="Macro groups">
      {order.map((id) => (
        <div
          key={id}
          className={over === id ? "bucket over" : "bucket"}
          style={{ borderTopColor: groupColor(id) }}
          {...dropProps(id)}
        >
          <div className="bucket-title">Group {groupLetter(id)}</div>
          <div className="chips">
            {labels.map((l, i) =>
              l === id ? (
                <button
                  key={i}
                  className="chip"
                  draggable
                  title="Drag to another group, or click to cycle"
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(i));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => onChange(cycleGroup(labels, i))}
                >
                  {i + 1}
                </button>
              ) : null,
            )}
          </div>
        </div>
      ))}
      {order.length < n && (
        <div className={over === "new" ? "bucket new over" : "bucket new"} {...dropProps("new")}>
          drop here for a new group
        </div>
      )}
    </div>
  );
}
