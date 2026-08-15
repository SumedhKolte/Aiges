import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // The app never uses next/image, so this only exists as attack surface:
  // /_next/image is a public route by default and would otherwise run
  // attacker-supplied URLs through sharp/libvips (GHSA-f88m-g3jw-g9cj) even
  // though no page ever calls <Image>. Disabling it removes that route.
  images: { unoptimized: true },
};

export default nextConfig;
