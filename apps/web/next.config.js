/** @type {import('next').NextConfig} */
const opfunApiUrl =
  (process.env.OPFUN_API_URL || process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

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
