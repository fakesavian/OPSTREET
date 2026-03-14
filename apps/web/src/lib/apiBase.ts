const LOCAL_WEB_PORT = "3000";
const LOCAL_WEB_BASE = `http://localhost:${LOCAL_WEB_PORT}`;
const NODE_ENV = process.env["NODE_ENV"] ?? "development";

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

function isLocalApiOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin);
}

function getConfiguredApiUrl(): string {
  return trimTrailingSlash(process.env["NEXT_PUBLIC_API_URL"]?.trim() || "");
}

function ensureValidConfiguredApiUrl(configured: string): void {
  if (!configured) return;
  if (!/^https?:\/\//i.test(configured)) {
    throw new Error(
      `Invalid NEXT_PUBLIC_API_URL '${configured}'. Use an absolute http(s) origin or leave it unset.`,
    );
  }
  if (NODE_ENV !== "development" && isLocalApiOrigin(configured)) {
    throw new Error(
      `Invalid production API configuration: NEXT_PUBLIC_API_URL points to localhost (${configured}). ` +
      "Leave NEXT_PUBLIC_API_URL unset to use same-origin /api in Vercel, or set it to your public API origin.",
    );
  }
}

export interface ApiRuntimeConfig {
  mode: "explicit" | "same-origin";
  base: string;
  environment: "development" | "production";
  explicit: boolean;
}

export function getApiRuntimeConfig(): ApiRuntimeConfig {
  const configured = getConfiguredApiUrl();
  ensureValidConfiguredApiUrl(configured);
  if (configured) {
    return {
      mode: "explicit",
      base: configured,
      environment: NODE_ENV === "development" ? "development" : "production",
      explicit: true,
    };
  }

  if (typeof window !== "undefined") {
    const { origin } = window.location;
    return {
      mode: "same-origin",
      base: `${trimTrailingSlash(origin)}/api`,
      environment: NODE_ENV === "development" ? "development" : "production",
      explicit: false,
    };
  }

  const serverOrigin = inferServerOrigin();
  if (serverOrigin) {
    return {
      mode: "same-origin",
      base: `${serverOrigin}/api`,
      environment: NODE_ENV === "development" ? "development" : "production",
      explicit: false,
    };
  }

  if (NODE_ENV === "development") {
    return {
      mode: "same-origin",
      base: `${LOCAL_WEB_BASE}/api`,
      environment: "development",
      explicit: false,
    };
  }

  throw new Error(
    "Unable to resolve the production API origin. Leave NEXT_PUBLIC_API_URL unset for same-origin /api on Vercel, " +
    "or provide a public API origin during SSR.",
  );
}

export function getApiBase(): string {
  return getApiRuntimeConfig().base;
}

export function isLocalApiBase(base: string): boolean {
  return isLocalApiOrigin(base);
}
