/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@electric-sql/pglite'],
  allowedDevOrigins: ['*.e2b.app'],
};

export default nextConfig;
