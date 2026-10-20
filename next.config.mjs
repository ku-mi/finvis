/** @type {import('next').NextConfig} */
const nextConfig = {
  // lets a production build run alongside `npm run dev`
  distDir: process.env.NEXT_DIST_DIR || ".next",
};
export default nextConfig;
