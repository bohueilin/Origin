// Deterministic ID factory — monotonic counter per session (no Math.random), so a run is
// fully reproducible and testable.

export class IdFactory {
  private counters = new Map<string, number>()

  next(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1
    this.counters.set(prefix, n)
    return `${prefix}_${n.toString().padStart(3, '0')}`
  }
}
