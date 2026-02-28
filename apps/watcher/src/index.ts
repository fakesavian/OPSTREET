/**
 * OPFun Watchtower — Milestone 1 stub.
 * Pings the API health endpoint every 2 minutes and logs status.
 * Milestone 4 will extend this with real OP_NET contract monitoring.
 * SAFETY: Does not connect to mainnet, does not hold any keys.
 */

const API_URL = process.env["API_URL"] ?? "http://localhost:3001";
const INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

async function ping(): Promise<void> {
  const start = Date.now();
  try {
    const res = await fetch(`${API_URL}/health`);
    const elapsed = Date.now() - start;
    if (res.ok) {
      const body = await res.json() as { status: string; timestamp: string };
      console.log(`[watcher] ✓ API healthy | ${elapsed}ms | ${body.timestamp}`);
    } else {
      console.warn(`[watcher] ✗ API returned ${res.status} | ${elapsed}ms`);
    }
  } catch (err) {
    const elapsed = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[watcher] ✗ API unreachable | ${elapsed}ms | ${msg}`);
  }
}

console.log(`[watcher] Starting — polling ${API_URL}/health every 2 minutes`);
console.log(`[watcher] Milestone 4 will add contract monitoring via Bob (opnet-bob MCP)`);

// Run immediately on start, then every 2 min
await ping();
setInterval(() => {
  ping().catch(console.error);
}, INTERVAL_MS);
