import axios, { AxiosInstance } from "axios";
import { CircuitBreaker } from "./circuitBreaker.js";
import { legacyCallDuration, legacyFailures } from "./metrics.js";

export interface LegacyClientOpts {
  baseURL: string;
  timeoutMs?: number;
  failureThreshold?: number;
  resetTimeoutMs?: number;
  maxRetries?: number;
}

export class LegacyClient {
  private http: AxiosInstance;
  private breaker: CircuitBreaker;
  private maxRetries: number;

  constructor(opts: LegacyClientOpts) {
    this.http = axios.create({
      baseURL: opts.baseURL,
      timeout: opts.timeoutMs ?? 5000
    });
    this.breaker = new CircuitBreaker({
      failureThreshold: opts.failureThreshold ?? 5,
      resetTimeoutMs: opts.resetTimeoutMs ?? 10_000
    });
    this.maxRetries = opts.maxRetries ?? 2;
  }

  private async backoff(ms: number) {
    await new Promise((r) => setTimeout(r, ms));
  }

  private async timed<T>(endpoint: string, fn: () => Promise<T>): Promise<T> {
    const end = legacyCallDuration.startTimer({ endpoint });
    try {
      const result = await fn();
      end({ code: "OK" });
      this.breaker.recordSuccess();
      return result;
    } catch (err: any) {
      end({ code: String(err?.response?.status ?? "ERR") });
      this.breaker.recordFailure();
      legacyFailures.inc({ endpoint });
      throw err;
    }
  }

  private async request<T>(method: "get" | "post", url: string, data?: any): Promise<T> {
    // If OPEN, try a half-open probe (one quick request) before failing
    if (this.breaker.isOpen()) {
      await this.breaker.probe(async () => {
        try {
          await this.http.get("/health"); // or any cheap endpoint your legacy has
          return true;
        } catch {
          return false;
        }
      });
      if (this.breaker.isOpen()) {
        const e = new Error("CircuitOpen");
        (e as any).code = "CIRCUIT_OPEN";
        throw e;
      }
    }

    let attempt = 0;
    let delay = 150; // ms
    while (true) {
      try {
        return await this.timed<T>(url, async () => {
          const res =
            method === "get"
              ? await this.http.get<T>(url)
              : await this.http.post<T>(url, data);
          return res.data;
        });
      } catch (err: any) {
        const status = err?.response?.status;
        const retryable =
          err?.code === "ECONNABORTED" ||
          err?.code === "ETIMEDOUT" ||
          (status && status >= 500);

        if (!retryable || attempt >= this.maxRetries) throw err;

        attempt++;
        await this.backoff(delay);
        delay *= 2;
      }
    }
  }

  // Example domain call(s) — adapt to your legacy API
  async getUser(id: string) {
    return this.request<any>("get", `/users/${encodeURIComponent(id)}`);
  }
}
