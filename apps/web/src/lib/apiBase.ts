const LOCAL_API_PORT = "3001";
const LOCAL_API_BASE = `http://localhost:${LOCAL_API_PORT}`;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function inferServerOrigin(): string | null {
  const source =
    process.env["VERCEL_PROJECT_PRODUCTION_URL"]?.trim() ||
    process.env["VERCEL_URL"]?.trim() ||
    "";
  if (!source) return null;
  return source.startsWith("http://") || source.startsWith("https://")
    ? trimTrailingSlash(source)
    : `https://${trimTrailingSlash(source)}`;
}

export function getApiBase(): string {
  const configured = process.env["NEXT_PUBLIC_API_URL"]?.trim() || "";
  if (configured) return trimTrailingSlash(configured);

  if (typeof window !== "undefined") {
    const { protocol, hostname, origin } = window.location;
    if (isLocalHostname(hostname)) return `${protocol}//${hostname}:${LOCAL_API_PORT}`;
    return `${trimTrailingSlash(origin)}/api`;
  }

  const serverOrigin = inferServerOrigin();
  if (serverOrigin) return `${serverOrigin}/api`;

  return LOCAL_API_BASE;
}

export function isLocalApiBase(base: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(base);
}
