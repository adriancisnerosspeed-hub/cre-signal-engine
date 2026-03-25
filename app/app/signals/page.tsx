import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AnalyzePage from "@/app/analyze/page";

export default async function SignalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <AnalyzePage />;
}
