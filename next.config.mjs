/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pg', 'exceljs', 'bcryptjs'],
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
    ] }];
  },
};
export default nextConfig;
