/**
 * OPFun Watchtower — Milestone 4: Real OP_NET contract monitoring.
 *
 * For every LAUNCHED project with a contractAddress, this worker:
 *  1. Converts the P2TR/bech32m address to the 0x-prefixed hex key OPNet RPC expects.
 *  2. Calls Bob MCP → opnet_rpc → getCode to verify the contract still exists.
 *  3. Calls opnet_rpc → getStorageAt (slot 0x00) to read the owner storage slot.
 *  4. Detects anomalies and posts WatchEvent records to the API.
 *  5. The API auto-flags projects that receive CRITICAL events.
 *
 * SAFETY:
 *  - Read-only checks only. No keys, no signing, no transactions.
 *  - Targets OPNet testnet only.
 *  - Admin secret used only for internal API auth (not for any blockchain operation).
 */

import { BobClient } from "@opfun/opnet";
import type { ProjectDTO, WatchSeverity } from "@opfun/shared";

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────

const API_URL = process.env["API_URL"] ?? "http://localhost:3001";
const ADMIN_SECRET = process.env["ADMIN_SECRET"] ?? "dev-secret-change-me";
const POLL_INTERVAL_MS = Number(process.env["WATCH_INTERVAL_MS"] ?? 5 * 60 * 1000); // 5 min default
const OPNET_NETWORK = "testnet";

// ──────────────────────────────────────────────────────────────────────────────
// Bech32m → hex conversion (P2TR: bcrt1p… / tb1p… / bc1p…)
// Converts the 32-byte witness program to a 0x-prefixed hex string, which is
// the address format OPNet RPC expects.
// ──────────────────────────────────────────────────────────────────────────────

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const CHAR_MAP: Record<string, number> = {};
for (let i = 0; i < BECH32_CHARSET.length; i++) CHAR_MAP[BECH32_CHARSET[i]!] = i;

function convertBits(data: number[], from: number, to: number): number[] | null {
  let acc = 0, bits = 0;
  const ret: number[] = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      ret.push((acc >> bits) & maxv);
    }
  }
  // P2TR: 32 bytes → 256 bits, encoded as 52 × 5-bit groups (last group has 4 padding bits)
  // On decode we must NOT output a final partial group that's all padding
  if (bits >= from || ((acc << (to - bits)) & maxv)) return null;
  return ret;
}

/**
 * Convert a bech32m P2TR address (bcrt1p…, tb1p…, bc1p…) to a 0x-prefixed
 * 32-byte hex string.  Returns null if the address cannot be decoded.
 */
function p2trToHex(addr: string): string | null {
  const lower = addr.toLowerCase();
  const sep = lower.lastIndexOf("1");
  if (sep < 1) return null;

  const dataStr = lower.slice(sep + 1); // includes 6-char checksum
  if (dataStr.length < 8) return null;  // too short to be valid

  // Strip checksum (last 6 chars)
  const payload = dataStr.slice(0, -6);

  const fivebit: number[] = [];
  for (const ch of payload) {
    const v = CHAR_MAP[ch];
    if (v === undefined) return null;
    fivebit.push(v);
  }
  if (fivebit.length === 0) return null;

  const witnessVersion = fivebit[0]; // must be 1 for P2TR
  if (witnessVersion !== 1) return null;

  const decoded = convertBits(fivebit.slice(1), 5, 8);
  if (!decoded || decoded.length !== 32) return null;

  return "0x" + decoded.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ──────────────────────────────────────────────────────────────────────────────
// API helpers
// ──────────────────────────────────────────────────────────────────────────────

interface FullProject extends ProjectDTO {
  checkRuns: unknown[];
  watchEvents: unknown[];
}

async function fetchLaunchedProjects(): Promise<FullProject[]> {
  const res = await fetch(`${API_URL}/projects`);
  if (!res.ok) throw new Error(`API /projects returned ${res.status}`);
  const all = (await res.json()) as FullProject[];
  return all.filter((p) => p.status === "LAUNCHED" && p.contractAddress);
}

async function postWatchEvent(
  projectId: string,
  severity: WatchSeverity,
  title: string,
  detailsJson?: Record<string, unknown>,
  dedupKey?: string,
): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/projects/${projectId}/watch-events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": ADMIN_SECRET,
      },
      body: JSON.stringify({ severity, title, detailsJson, dedupKey }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      console.error(`[watcher] Failed to post event for ${projectId}: ${err.error ?? res.status}`);
    }
  } catch (err) {
    console.error(`[watcher] postWatchEvent error:`, err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// In-memory state: track last-known code hash to detect changes
// ──────────────────────────────────────────────────────────────────────────────

const lastCodeHash: Map<string, string> = new Map();
const lastOwnerSlot: Map<string, string> = new Map();
const pollCycleCount: Map<string, number> = new Map();

// ──────────────────────────────────────────────────────────────────────────────
// Core monitor function
// ──────────────────────────────────────────────────────────────────────────────

async function monitorProject(bob: BobClient, project: FullProject): Promise<void> {
  const { id, ticker, contractAddress } = project;
  if (!contractAddress) return;

  const hexAddr = p2trToHex(contractAddress);
  if (!hexAddr) {
    // Address may already be hex, or in an unexpected format — skip silently
    console.warn(`[watcher] ${ticker}: cannot convert address '${contractAddress}' to hex — skipping RPC checks`);
    return;
  }

  console.log(`[watcher] Checking ${ticker} (${contractAddress} → ${hexAddr})`);

  // ── getCode ────────────────────────────────────────────────────────────────
  let codePresent = false;
  let codeSummary = "";
  try {
    const result = await bob.callTool("opnet_rpc", {
      action: "getCode",
      network: OPNET_NETWORK,
      address: hexAddr,
      onlyBytecode: false,
    });
    const text = BobClient.text(result);
    // Bob returns an error string if the call fails, or code data if successful
    if (text.toLowerCase().includes("error") || text.toLowerCase().includes("not found")) {
      codePresent = false;
      codeSummary = text.slice(0, 200);
    } else {
      codePresent = true;
      codeSummary = text.slice(0, 200);
    }
  } catch (err) {
    console.error(`[watcher] ${ticker}: getCode error:`, err);
    await postWatchEvent(
      id, "WARN", `getCode RPC error — cannot verify contract`,
      { error: err instanceof Error ? err.message : String(err) },
      `RPC_ERROR:${id}`,  // M9: dedup — only one RPC-error event per 24 h per project
    );
    return;
  }

  if (!codePresent) {
    console.error(`[watcher] CRITICAL: ${ticker} contract code missing!`);
    await postWatchEvent(
      id, "CRITICAL", `Contract code missing — possible rug or self-destruct`,
      { address: contractAddress, hexAddress: hexAddr, rpcResponse: codeSummary },
      `CODE_MISSING:${id}`,  // M9: dedup
    );
    return;
  }

  // Detect code-hash changes between polls (potential upgrade/replacement)
  const prevCode = lastCodeHash.get(id);
  const codeFingerprint = codeSummary.slice(0, 64); // rough fingerprint
  if (prevCode !== undefined && prevCode !== codeFingerprint) {
    await postWatchEvent(
      id, "CRITICAL", `Contract bytecode changed since last check — unexpected upgrade`,
      { address: contractAddress, prevFingerprint: prevCode, currFingerprint: codeFingerprint },
      `CODE_CHANGE:${id}:${codeFingerprint.slice(0, 8)}`,  // M9: unique per changed fingerprint
    );
  }
  lastCodeHash.set(id, codeFingerprint);

  // ── getStorageAt slot 0 (owner / admin storage) ───────────────────────────
  try {
    const slotResult = await bob.callTool("opnet_rpc", {
      action: "getStorageAt",
      network: OPNET_NETWORK,
      address: hexAddr,
      pointer: "0x00",
    });
    const slotText = BobClient.text(slotResult);

    if (!slotText.toLowerCase().includes("error")) {
      const prevOwner = lastOwnerSlot.get(id);
      const ownerFingerprint = slotText.slice(0, 128);
      if (prevOwner !== undefined && prevOwner !== ownerFingerprint) {
        await postWatchEvent(
          id, "WARN", `Storage slot 0 (possible owner) changed since last check`,
          { prevValue: prevOwner, currValue: ownerFingerprint },
          `OWNER_CHANGE:${id}:${ownerFingerprint.slice(0, 8)}`,  // M9: unique per new owner value
        );
      }
      lastOwnerSlot.set(id, ownerFingerprint);
    }
  } catch {
    // Storage slot read failure is non-critical — contract still exists
  }

  // All checks passed — record a heartbeat INFO event every 3rd cycle to avoid flooding
  const cycles = (pollCycleCount.get(id) ?? 0) + 1;
  pollCycleCount.set(id, cycles);
  if (cycles % 3 === 0) {
    // Heartbeat INFO — no dedupKey so each heartbeat is always recorded (low spam by design)
    await postWatchEvent(id, "INFO", `Contract alive — code and storage verified`, {
      address: contractAddress, network: OPNET_NETWORK, cycle: cycles,
    });
  }

  console.log(`[watcher] ${ticker}: OK`);
}

async function runWatchCycle(bob: BobClient): Promise<void> {
  console.log(`[watcher] ── Watch cycle starting at ${new Date().toISOString()} ──`);

  let projects: FullProject[];
  try {
    projects = await fetchLaunchedProjects();
  } catch (err) {
    console.error(`[watcher] Cannot fetch projects:`, err);
    return;
  }

  if (projects.length === 0) {
    console.log(`[watcher] No LAUNCHED projects to monitor.`);
    return;
  }

  console.log(`[watcher] Monitoring ${projects.length} LAUNCHED project(s)…`);
  for (const project of projects) {
    try {
      await monitorProject(bob, project);
    } catch (err) {
      console.error(`[watcher] Unhandled error for ${project.ticker}:`, err);
    }
  }
  console.log(`[watcher] ── Cycle complete ──`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────────────────────────

console.log(`[watcher] OPFun Watchtower starting`);
console.log(`[watcher]   API:      ${API_URL}`);
console.log(`[watcher]   Network:  ${OPNET_NETWORK}`);
console.log(`[watcher]   Interval: ${POLL_INTERVAL_MS / 1000}s`);

// Init Bob MCP session
const bob = new BobClient();
try {
  await bob.init();
  console.log(`[watcher] Bob MCP session initialized`);
} catch (err) {
  console.error(`[watcher] Warning: Bob MCP init failed — will retry on first call`, err);
}

// First cycle immediately
await runWatchCycle(bob);

// Then repeat on interval
setInterval(() => {
  runWatchCycle(bob).catch(console.error);
}, POLL_INTERVAL_MS);
