const nextConfig = {
  transpilePackages: ["@opfun/shared"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // @btc-vision packages initialize secp256k1/crypto at import time — crashes Next.js SSR.
  // Mark them server-external so they only load in the browser bundle.
  experimental: {
    serverExternalPackages: [
      "@btc-vision/walletconnect",
      "@btc-vision/transaction",
      "@btc-vision/bitcoin",
      "opnet",
    ],
  },
};

module.exports = nextConfig;
