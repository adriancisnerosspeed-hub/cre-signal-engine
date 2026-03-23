import { redirect } from "next/navigation";

/**
 * Legacy/wrong URL: some users expect the owner tools under /app/owner/*.
 * Canonical route is /owner/dev (top-level route group, not under /app).
 */
export default function OwnerDevRedirectPage() {
  redirect("/owner/dev");
}
