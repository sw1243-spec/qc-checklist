import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      // /SWJ/* → 내부적으로 /admin/* 라우트로 처리
      { source: "/SWJ",          destination: "/admin"          },
      { source: "/SWJ/:path*",   destination: "/admin/:path*"   },
    ];
  },
  async redirects() {
    return [
      // /admin/* 로 직접 접근하면 → /SWJ/* 로 리다이렉트
      { source: "/admin",        destination: "/SWJ",         permanent: false },
      { source: "/admin/:path*", destination: "/SWJ/:path*",  permanent: false },
    ];
  },
};

export default nextConfig;
