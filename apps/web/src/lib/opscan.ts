const OPSCAN_BASE = "https://opscan.org";
const OPSCAN_NETWORK = "testnet";

function trimValue(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function getOpScanHomeUrl(): string {
  return `${OPSCAN_BASE}/?network=${OPSCAN_NETWORK}`;
}

export function getOpScanContractUrl(address: string | null | undefined): string | null {
  const normalized = trimValue(address);
  if (!normalized) return null;
  return `${OPSCAN_BASE}/contracts/${encodeURIComponent(normalized)}?network=${OPSCAN_NETWORK}`;
}
