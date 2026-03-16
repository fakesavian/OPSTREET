import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPNET_BASE = "https://testnet.opnet.org";

/**
 * Server-side proxy for the OPNet UTXO API.
 * Browser pages cannot call testnet.opnet.org directly due to CORS.
 * GET /api/opnet-utxos?address=opt1p...
 */
export async function GET(request: NextRequest): Promise<Response> {
  const address = request.nextUrl.searchParams.get("address");
  if (!address) {
    return Response.json({ error: "address is required" }, { status: 400 });
  }

  try {
    const url = `${OPNET_BASE}/api/v1/address/utxos?address=${encodeURIComponent(address)}&optimize=false`;
    const upstream = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return Response.json(
        { error: `OPNet UTXO API returned ${upstream.status}` },
        { status: upstream.status },
      );
    }
    const data = await upstream.json();
    return Response.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Failed to fetch UTXOs: ${msg}` }, { status: 502 });
  }
}
