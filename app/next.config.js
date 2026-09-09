/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false, // don't advertise "X-Powered-By: Next.js" to every response
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Clickjacking protection — found missing by a Nikto scan against the running app.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          // MIME-sniffing protection.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Don't leak the full referring URL (which can contain IDs) to external links.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
