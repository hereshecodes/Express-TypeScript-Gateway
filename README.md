# legacy-bridge-ts

A tiny TypeScript API gateway that **wraps** a legacy service and adds:

- Caching (LRU with TTL)
- Retries with exponential backoff
- Simple circuit breaker
- Prometheus metrics at `/metrics`
- Health endpoint at `/health`

## Why?
Modernize **by wrapping first**. Keep production stable while you gradually refactor or replace the legacy system behind a clean interface.

## Quick Start

```bash
git clone <your-repo-url> legacy-bridge-ts
cd legacy-bridge-ts
npm i
npm run dev
