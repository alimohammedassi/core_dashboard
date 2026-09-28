import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { dbError } from "@/lib/api-error";

// GET /api/foods/search?q=chicken&page=0 — server-side ilike over the shared
// foods library, 20 rows per page. Never loads the library into the browser.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  const page = Math.max(0, Number(req.nextUrl.searchParams.get("page") ?? 0) || 0);
  const perPage = 20;

  const supabase = await createClient();
  let query = supabase
    .from("foods")
    .select("id, name, name_ar, category, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g")
    .order("name")
    .range(page * perPage, page * perPage + perPage - 1);
  if (q.length > 0) {
    const safe = q.replace(/[%_,]/g, "");
    query = query.or(`name.ilike.%${safe}%,name_ar.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json(dbError("foods/search", error), { status: 400 });
  return NextResponse.json({ foods: data ?? [], page, perPage });
}
