import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Document uploads go through a Server Action, which caps request
      // bodies at 1MB by default. 12mb leaves room for the 10MB file limit
      // enforced in uploadDocument plus multipart overhead.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
