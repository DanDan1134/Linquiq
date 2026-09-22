import type { NextConfig } from "next";

const clerkFrame = "https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com",
      "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://api.clerk.com https://*.amazonaws.com https://*.vercel.app wss://*.clerk.accounts.dev",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      `frame-src 'self' ${clerkFrame}`,
      "frame-ancestors 'self'",
      "base-uri 'self'",
      // Clerk Account Portal / email OTP may POST then redirect cross-origin;
      // Chrome enforces form-action on those redirects — allow Clerk hosts.
      "form-action 'self' https://*.clerk.accounts.dev https://*.clerk.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
