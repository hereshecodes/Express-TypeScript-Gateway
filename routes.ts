import { Router } from "express";
import { LegacyClient } from "./legacy.js";
import { cache, cacheKey } from "./cache.js";
import { registry, httpDuration } from "./metrics.js";

export function buildRoutes(legacy: LegacyClient) {
  const r = Router();

  // Timing middleware for request metrics
  r.use((req, res, next) => {
    const end = httpDuration.startTimer({ method: req.method, route: req.path });
    res.on("finish", () => {
      end({ code: String(res.statusCode) });
    });
    next();
  });

  r.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  r.get("/metrics", async (_req, res) => {
    res.set("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  });

  // Example "wrapped" endpoint: user profile
  r.get("/api/users/:id", async (req, res) => {
    const id = req.params.id;
    const key = cacheKey(["user", id]);

    try {
      const data = await legacy.getUser(id);
      cache.set(key, data);
      res.setHeader("X-Cache", "MISS");
      res.json({ data, source: "legacy" });
    } catch (err: any) {
      // Serve cached if available
      if (cache.has(key)) {
        res.setHeader("X-Cache", "HIT");
        return res.json({ data: cache.get(key), source: "cache" });
      }

      const code =
        err?.code === "CIRCUIT_OPEN"
          ? 503
          : Number(err?.response?.status) || 502;

      res.status(code).json({
        error: "UpstreamUnavailable",
        details: err?.message ?? "legacy call failed",
      });
    }
  });

  return r;
}
