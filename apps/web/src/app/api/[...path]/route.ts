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

function buildTargetUrl(request: NextRequest, path: string[], origin: string): URL {
  const suffix = path.join("/");
  const url = new URL(`${origin}/${suffix}`);
  url.search = request.nextUrl.search;
  return url;
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

async function proxyRequest(
  request: NextRequest,
  context: { params: { path: string[] } },
): Promise<Response> {
  const { origin, error } = resolveApiOrigin();
  if (!origin) {
    return Response.json({ error }, { status: 503 });
  }

  const targetUrl = buildTargetUrl(request, context.params.path, origin);
  const headers = buildForwardHeaders(request);
  const method = request.method.toUpperCase();

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: buildResponseHeaders(upstream),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upstream error.";
    return Response.json(
      {
        error:
          `Failed to reach backend API at ${origin}. ` +
          "Confirm OPFUN_API_URL points to a live deployment and that the backend is reachable from Vercel.",
        details: message,
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
