import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Statically generated at build time (compatible with output: 'export').
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/privacy`,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
