import { getOpnetJsonRpcUrl, getOpnetNetworkConfig } from "@opfun/opnet";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side proxy for OP_NET UTXOs.
 * Browser pages cannot call OP_NET RPC directly in every environment (CORS).
 * Uses the same canonical OP_NET network/RPC config as the runtime provider.
 * GET /api/opnet-utxos?address=opt1p...
 */
export async function GET(request: NextRequest): Promise<Response> {
  const address = request.nextUrl.searchParams.get("address");
  if (!address) {
    return Response.json({ error: "address is required" }, { status: 400 });
  }

  const networkConfig = getOpnetNetworkConfig();
  const jsonRpcUrl = getOpnetJsonRpcUrl();

  try {
    // Use JSON-RPC btc_getUTXOs — same method the opnet SDK uses internally.
    // Returns { result: { confirmed: [...], pending: [...], raw: [...] } }
    const rpcPayload = {
      jsonrpc: "2.0",
      method: "btc_getUTXOs",
      params: [address, false],
      id: 1,
    };

    const upstream = await fetch(jsonRpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rpcPayload),
      cache: "no-store",
    });

    if (!upstream.ok) {
      return Response.json(
        {
          error: `OP_NET RPC returned ${upstream.status}`,
          network: networkConfig.network,
        },
        { status: upstream.status },
      );
    }

    const rpc = await upstream.json() as { result?: unknown; error?: unknown };
    if (rpc.error) {
      return Response.json(
        { error: rpc.error, network: networkConfig.network },
        { status: 502 },
      );
    }

    // Normalize: return { confirmed, pending } regardless of RPC shape.
    const result = rpc.result as Record<string, unknown> | null | undefined;
    const confirmed = Array.isArray(result?.confirmed) ? result.confirmed : [];
    const pending = Array.isArray(result?.pending) ? result.pending : [];
    const raw = Array.isArray(result?.raw) ? result.raw : [];

    return Response.json({
      confirmed,
      pending,
      raw,
      network: networkConfig.network,
      bitcoinNetworkKey: networkConfig.bitcoinNetworkKey,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: `Failed to fetch UTXOs: ${msg}`, network: networkConfig.network },
      { status: 502 },
    );
  }
}
