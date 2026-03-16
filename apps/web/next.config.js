const path = require("path");

/**
 * @btc-vision/walletconnect (and its deps) are pure-ESM packages that
 * initialise secp256k1/WASM at module-load time.  That crashes Next.js
 * static pre-rendering in two ways:
 *
 *   1. If bundled by webpack → secp256k1 WASM init crashes during SSR.
 *   2. If marked external    → Node.js ESM loader fails on extensionless
 *      relative imports inside the package (ERR_MODULE_NOT_FOUND).
 *
 * The fix: on the SERVER build, replace @btc-vision/walletconnect with a
 * no-op shim (src/lib/walletconnect-ssr-shim.tsx) via webpack resolve.alias.
 * The shim exports the same API surface but contains no crypto code.
 * The real package only ever loads in the browser bundle.
 */
const nextConfig = {
  transpilePackages: ["@opfun/shared"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        // Swap walletconnect for a safe no-op shim on the server
        "@btc-vision/walletconnect": path.resolve(
          __dirname,
          "src/lib/walletconnect-ssr-shim.tsx"
        ),
      };
    }
    return config;
  },
};

module.exports = nextConfig;
