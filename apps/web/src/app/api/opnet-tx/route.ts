import { fetchTransactionReceipt, getOpnetNetworkConfig } from "@opfun/opnet";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side OP_NET transaction status proxy.
 *
 * Browser mempool explorers can lag or disagree with the OP_NET RPC for this
 * custom signet chain. The app should use OP_NET RPC as the source of truth for
 * tx status instead of mempool.opnet.org pages.
 *
 * GET /api/opnet-tx?txId=<64-hex>
 */
export async function GET(request: NextRequest): Promise<Response> {
  const txId = request.nextUrl.searchParams.get("txId")?.trim() ?? "";
  const purpose = request.nextUrl.searchParams.get("purpose")?.trim() ?? "opnet";
  const networkConfig = getOpnetNetworkConfig();

  if (!/^[0-9a-f]{64}$/i.test(txId)) {
    return Response.json(
      { error: "txId must be a 64-character hex transaction id.", network: networkConfig.network },
      { status: 400 },
    );
  }

  try {
    const receipt = await fetchTransactionReceipt(txId);
    return Response.json({
      txId,
      found: receipt.found,
      status: purpose === "funding" && receipt.found && receipt.blockHeight !== undefined
        ? "confirmed"
        : receipt.status,
      confirmed: purpose === "funding" && receipt.found && receipt.blockHeight !== undefined
        ? true
        : receipt.status === "confirmed" || receipt.status === "failed",
      blockHeight: receipt.blockHeight ?? null,
      revert: receipt.revert ?? null,
      network: networkConfig.network,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: `Failed to fetch OP_NET tx status: ${msg}`, network: networkConfig.network },
      { status: 502 },
    );
  }
}
