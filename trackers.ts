// deno-lint-ignore-file no-explicit-any

export class ValueTracker {
  private readonly values: Map<string, any[]>;
  constructor() {
    this.values = new Map();
  }
  track(property: string) {
    if (!this.values.has(property)) {
      this.values.set(property, []);
    }
  }
  tracks(property: string): boolean {
    return this.values.has(property);
  }
  add(property: string, value: any) {
    if (this.values.has(property)) {
      // This is slow
      //this.values.set(property, [...(this.values.get(property) || []), value]);
      // This is much much faster
      this.values.get(property)?.push(value);
    } else {
      this.values.set(property, [value]);
    }
  }
  get(property: string): any[] | undefined {
    return this.values.get(property);
  }
}

export class PerformanceTracker {
  // Note: All measurements are in milliseconds
  private start = 0;
  private end = 0;

  private counter = 0;
  constructor() {
    this.start = performance.now();
  }
  stop() {
    this.end = performance.now();
  }
  get duration() {
    const end = this.end || performance.now();
    return end - this.start;
  }

  get prSec() {
    return (this.counter / this.duration) * 1000;
  }

  count() {
    this.counter++;
  }
}
