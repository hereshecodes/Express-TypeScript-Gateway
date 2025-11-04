type HalfOpenProbe = () => Promise<boolean>;

export interface CircuitOptions {
  failureThreshold: number;   // open after N consecutive failures
  resetTimeoutMs: number;     // how long to stay open before half-open
}

export class CircuitBreaker {
  private failures = 0;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private nextAttempt = 0;

  constructor(private opts: CircuitOptions) {}

  status() {
    if (this.state === "OPEN" && Date.now() > this.nextAttempt) {
      this.state = "HALF_OPEN";
    }
    return this.state;
  }

  isOpen() {
    return this.status() === "OPEN";
  }

  recordSuccess() {
    this.failures = 0;
    this.state = "CLOSED";
  }

  recordFailure() {
    this.failures++;
    if (this.failures >= this.opts.failureThreshold) {
      this.state = "OPEN";
      this.nextAttempt = Date.now() + this.opts.resetTimeoutMs;
    }
  }

  async probe(fn: HalfOpenProbe) {
    if (this.status() !== "HALF_OPEN") return;
    try {
      const ok = await fn();
      if (ok) this.recordSuccess();
      else this.recordFailure();
    } catch {
      this.recordFailure();
    }
  }
}
