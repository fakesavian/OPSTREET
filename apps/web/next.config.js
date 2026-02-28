/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@opfun/shared"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

module.exports = nextConfig;
