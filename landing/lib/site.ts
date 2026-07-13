// Single source of truth for the site's public URL, shared by the metadata
// defaults (layout.tsx), robots.txt, and sitemap.xml.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://relogo.app";
