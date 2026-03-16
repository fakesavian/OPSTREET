import type { NextRequest } from "next/server";

const DEFAULT_DEV_API_ORIGIN = "http://localhost:3001";
const HOP_BY_HOP_HEADERS = [
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  // The browser Origin is not relevant for server-to-server proxy calls — forwarding
  // it would trip the API's CORS origin guard when CORS_ORIGIN differs from the web URL.
  "origin",
  // Vercel infrastructure headers — forwarding these causes the API's Vercel edge
  // to see a mismatched host and issue a 308 redirect back to the web domain.
  "x-forwarded-host",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-real-ip",
  "x-vercel-forwarded-for",
  "x-vercel-id",
  "x-vercel-ip-city",
  "x-vercel-ip-country",
  "x-vercel-ip-country-region",
  "x-vercel-ip-latitude",
  "x-vercel-ip-longitude",
  "x-vercel-ip-timezone",
  "x-vercel-proxied-for",
  "x-vercel-sc-basepath",
  "x-vercel-sc-headers",
];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isLocalOrigin(value: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(value);
}

function resolveApiOrigin(): { origin: string | null; error?: string } {
  const nodeEnv = process.env["NODE_ENV"] ?? "development";
  const configured = trimTrailingSlash(
    process.env["OPFUN_API_URL"]?.trim() ||
      process.env["NEXT_PUBLIC_API_URL"]?.trim() ||
      (nodeEnv === "development" ? DEFAULT_DEV_API_ORIGIN : ""),
  );

  if (!configured) {
    return {
      origin: null,
      error:
        "API proxy is not configured. Set OPFUN_API_URL on the web deployment to your public backend origin.",
    };
  }

  if (!isAbsoluteHttpUrl(configured)) {
    return {
      origin: null,
      error: `Invalid OPFUN_API_URL '${configured}'. Use an absolute http(s) origin.`,
    };
  }

  if (nodeEnv !== "development" && isLocalOrigin(configured)) {
    return {
      origin: null,
      error:
        `Invalid production API configuration: ${configured}. ` +
        "OPFUN_API_URL must point to a public backend origin in preview/production.",
    };
  }

  return { origin: configured };
}

function joinUrlPath(...parts: string[]): string {
  const cleaned = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^\/+|\/+$/g, ""));
  return cleaned.length > 0 ? `/${cleaned.join("/")}` : "/";
}

function buildTargetUrl(
  request: NextRequest,
  path: string[],
  origin: string,
  extraPrefix?: string,
): URL {
  const base = new URL(origin);
  const suffix = path.join("/");
  const url = new URL(base.origin);
  url.pathname = joinUrlPath(base.pathname, extraPrefix ?? "", suffix);
  url.search = request.nextUrl.search;
  return url;
}

function isSelfTarget(request: NextRequest, origin: string): boolean {
  const target = new URL(origin);
  return target.origin === request.nextUrl.origin && (!target.pathname || target.pathname === "/");
}

function shouldTryApiPrefixFallback(request: NextRequest, origin: string): boolean {
  const target = new URL(origin);
  return target.origin !== request.nextUrl.origin && (!target.pathname || target.pathname === "/");
}

function buildForwardHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  HOP_BY_HOP_HEADERS.forEach((header) => {
    headers.delete(header);
  });
  return headers;
}

function buildResponseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.includes(key.toLowerCase())) {
      headers.append(key, value);
    }
  });

  const setCookies =
    (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    headers.delete("set-cookie");
    for (const cookie of setCookies) {
      headers.append("set-cookie", cookie);
    }
  }

  return headers;
}

async function normalizeUpstreamFailure(upstream: Response): Promise<Response | null> {
  const vercelError = upstream.headers.get("x-vercel-error")?.trim() ?? "";
  const bodyText = await upstream.clone().text().catch(() => "");
  if (!/DEPLOYMENT_NOT_FOUND|deployment could not be found/i.test(`${vercelError}\n${bodyText}`)) {
    return null;
  }

  return Response.json(
    {
      error:
        "Backend API deployment is unavailable. Update OPFUN_API_URL to a live backend origin and redeploy the web app.",
    },
    { status: 502 },
  );
}

async function proxyRequest(
  request: NextRequest,
  context: { params: { path: string[] } },
): Promise<Response> {
  const { origin, error } = resolveApiOrigin();
  if (!origin) {
    return Response.json({ error }, { status: 503 });
  }

  if (isSelfTarget(request, origin)) {
    return Response.json(
      {
        error:
          "OPFUN_API_URL is pointing at this web app instead of the backend API service. Set it to the API deployment origin, or include its base path if it is mounted under /api.",
      },
      { status: 503 },
    );
  }

  const targetUrl = buildTargetUrl(request, context.params.path, origin);
  const headers = buildForwardHeaders(request);
  const method = request.method.toUpperCase();
  // Read the body once and store as Uint8Array.
  // Uint8Array.prototype.slice() creates a NEW independent ArrayBuffer each
  // call, so the 404-fallback retry can pass fresh bytes to a second fetch
  // without hitting the "detached ArrayBuffer" error that occurs when undici
  // transfers/detaches the buffer after the first fetch call.
  const bodyBytes =
    method === "GET" || method === "HEAD"
      ? null
      : new Uint8Array(await request.arrayBuffer());
  const makeBody = () => (bodyBytes !== null ? bodyBytes.slice() : undefined);

  const apiOrigin = new URL(origin).origin;

  try {
    let upstream = await fetch(targetUrl, {
      method,
      headers,
      body: makeBody(),
      cache: "no-store",
      redirect: "follow",
    });

    // If the request was redirected outside the API origin, Vercel deployment
    // protection or another infrastructure redirect intercepted the request.
    if (upstream.redirected && upstream.url && !upstream.url.startsWith(apiOrigin)) {
      return Response.json(
        {
          error:
            "API request was redirected away from the API origin. " +
            "Disable Vercel Authentication on the API project (Settings → Deployment Protection).",
        },
        { status: 503 },
      );
    }

    if (upstream.status === 404 && shouldTryApiPrefixFallback(request, origin)) {
      const fallbackUrl = buildTargetUrl(request, context.params.path, origin, "api");
      const fallback = await fetch(fallbackUrl, {
        method,
        headers,
        body: makeBody(),
        cache: "no-store",
        redirect: "follow",
      });
      if (fallback.ok || fallback.status !== 404) {
        upstream = fallback;
      }
    }

    if (!upstream.ok) {
      const normalized = await normalizeUpstreamFailure(upstream);
      if (normalized) return normalized;
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: buildResponseHeaders(upstream),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upstream error.";
    const cause = error instanceof Error && (error as Error & { cause?: unknown }).cause;
    const causeMsg = cause instanceof Error ? `${cause.message} (code: ${(cause as Error & { code?: string }).code ?? "?"})` : String(cause ?? "");
    return Response.json(
      {
        error:
          `Failed to reach backend API at ${origin}. ` +
          "Confirm OPFUN_API_URL points to a live deployment and that the backend is reachable from Vercel.",
        details: causeMsg || message,
      },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest, context: { params: { path: string[] } }): Promise<Response> {
  return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: { params: { path: string[] } }): Promise<Response> {
  return proxyRequest(request, context);
}

export async function PUT(request: NextRequest, context: { params: { path: string[] } }): Promise<Response> {
  return proxyRequest(request, context);
}

export async function PATCH(request: NextRequest, context: { params: { path: string[] } }): Promise<Response> {
  return proxyRequest(request, context);
}

export async function DELETE(request: NextRequest, context: { params: { path: string[] } }): Promise<Response> {
  return proxyRequest(request, context);
}

export async function OPTIONS(request: NextRequest, context: { params: { path: string[] } }): Promise<Response> {
  return proxyRequest(request, context);
}

export async function HEAD(request: NextRequest, context: { params: { path: string[] } }): Promise<Response> {
  return proxyRequest(request, context);
}
