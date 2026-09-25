import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Hide Next.js bottom-left "Rendering" badge — app uses NavigationProgress instead
  devIndicators: false,
};

export default nextConfig;
