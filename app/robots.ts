import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/app/",
        "/owner/",
        "/settings/",
        "/auth/",
        "/invite/",
        "/digest/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
