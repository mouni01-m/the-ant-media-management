import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/login",
        destination: "/",
        permanent: false,
      },
      {
        source: "/founder/calendar",
        destination: "/founder/content-calendar",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
