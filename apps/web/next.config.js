/** @type {import('next').NextConfig} */
const nodeEnv = process.env.NODE_ENV || "development";
const defaultDevApiUrl = nodeEnv === "development" ? "http://localhost:3001" : "";
const opfunApiUrl =
  (process.env.OPFUN_API_URL || process.env.NEXT_PUBLIC_API_URL || defaultDevApiUrl).replace(/\/+$/, "");

function isLocalOrigin(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(url);
}

if (nodeEnv !== "development" && opfunApiUrl && isLocalOrigin(opfunApiUrl)) {
  throw new Error(
    `Invalid production API configuration: ${opfunApiUrl}. ` +
    "Leave NEXT_PUBLIC_API_URL unset to use same-origin /api in Vercel, or set OPFUN_API_URL to a public backend origin.",
  );
}

const nextConfig = {
  transpilePackages: ["@opfun/shared"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async rewrites() {
    if (!opfunApiUrl || !/^https?:\/\//i.test(opfunApiUrl)) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${opfunApiUrl}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
