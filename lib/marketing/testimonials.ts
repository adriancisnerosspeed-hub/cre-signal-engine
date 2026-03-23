import { createClient } from "@/lib/supabase/server";
import type { TestimonialRow } from "@/lib/marketing/types";

export type { TestimonialRow } from "@/lib/marketing/types";

export async function getActiveTestimonials(): Promise<TestimonialRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("testimonials")
    .select("id, firm_type, persona, quote, attribution, deal_context, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return data as TestimonialRow[];
}
