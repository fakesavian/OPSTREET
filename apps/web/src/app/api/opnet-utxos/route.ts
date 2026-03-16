import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPNET_RPC = "https://testnet.opnet.org/api/v1/json-rpc";

/**
 * Server-side proxy for OPNet UTXOs.
 * Browser pages cannot call testnet.opnet.org directly (CORS).
 * Uses JSON-RPC btc_getUTXOs which matches what the opnet SDK uses.
 * GET /api/opnet-utxos?address=opt1p...
 */
export async function GET(request: NextRequest): Promise<Response> {
  const address = request.nextUrl.searchParams.get("address");
  if (!address) {
    return Response.json({ error: "address is required" }, { status: 400 });
  }

  try {
    // Use JSON-RPC btc_getUTXOs — same method the opnet SDK uses internally.
    // Returns { result: { confirmed: [...], pending: [...], raw: [...] } }
    const rpcPayload = {
      jsonrpc: "2.0",
      method: "btc_getUTXOs",
      params: [address, false],
      id: 1,
    };

    const upstream = await fetch(OPNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rpcPayload),
      cache: "no-store",
    });

    if (!upstream.ok) {
      return Response.json(
        { error: `OPNet RPC returned ${upstream.status}` },
        { status: upstream.status },
      );
    }

    const rpc = await upstream.json() as { result?: unknown; error?: unknown };
    if (rpc.error) {
      return Response.json({ error: rpc.error }, { status: 502 });
    }

    // Normalize: return { confirmed, pending } regardless of RPC shape
    const result = rpc.result as Record<string, unknown> | null | undefined;
    const confirmed = Array.isArray(result?.confirmed) ? result.confirmed : [];
    const pending = Array.isArray(result?.pending) ? result.pending : [];
    const raw = Array.isArray(result?.raw) ? result.raw : [];

    return Response.json({ confirmed, pending, raw });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Failed to fetch UTXOs: ${msg}` }, { status: 502 });
  }
}
