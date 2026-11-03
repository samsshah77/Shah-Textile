import type { NextConfig } from "next";

const isVercel = Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { output: "standalone" }),
  // Hide Next.js bottom-left "Rendering" badge — app uses NavigationProgress instead
  devIndicators: false,
};

export default nextConfig;
