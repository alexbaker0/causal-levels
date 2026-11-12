import { SAMPLE_WIDTH } from "../../core/noble";

export interface Marker {
  t: number;
  label: string;
}

/** Rolling buffer of recent samples, written by the worker callback and read by the canvases. */
export class SampleStore {
  readonly width = SAMPLE_WIDTH;
  readonly data: Float32Array;
  count = 0;
  tNow = 0;
  markers: Marker[] = [];

  constructor(readonly capacity = 12000) {
    this.data = new Float32Array(capacity * SAMPLE_WIDTH);
  }

  clear(): void {
    this.count = 0;
    this.tNow = 0;
    this.markers = [];
  }

  push(chunk: Float32Array, tNow: number): void {
    const rows = chunk.length / this.width;
    if (rows > this.capacity) chunk = chunk.subarray(chunk.length - this.capacity * this.width);
    const incoming = chunk.length / this.width;
    const overflow = this.count + incoming - this.capacity;
    if (overflow > 0) {
      this.data.copyWithin(0, overflow * this.width, this.count * this.width);
      this.count -= overflow;
    }
    this.data.set(chunk, this.count * this.width);
    this.count += incoming;
    this.tNow = tNow;
    const oldest = this.count > 0 ? this.data[0] : tNow;
    if (this.markers.length && this.markers[0].t < oldest) this.markers = this.markers.filter((m) => m.t >= oldest);
  }

  /** value of column `col` in row `row` */
  at(row: number, col: number): number {
    return this.data[row * this.width + col];
  }

  /** index of the first row with time >= t */
  lowerBound(t: number): number {
    let lo = 0;
    let hi = this.count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.data[mid * this.width] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
