/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Keep Prisma out of the server bundle so the generated client and its
  // query engine binaries are resolved from node_modules at runtime. Bundling
  // it breaks the ".prisma/client/default" lookup on Netlify.
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
