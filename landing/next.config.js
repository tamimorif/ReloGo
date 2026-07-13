/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // This repository has several independent app lockfiles. Pin the landing
  // root so Next does not infer the repository root from the unrelated root
  // lockfile when running dev/Turbopack.
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true,
  },
};
module.exports = nextConfig;
