import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Create a user in a practice. Proxies to the API (admin-guarded there).
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const practiceId = body?.practiceId;
  if (!practiceId) {
    return NextResponse.json({ error: "practiceId required" }, { status: 400 });
  }
  const { email, full_name, role } = body;

  const apiUrl = process.env.MDT_API_URL ?? "http://localhost:8000";
  const upstream = await fetch(
    `${apiUrl}/practices/${practiceId}/users`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, full_name, role }),
      cache: "no-store",
    },
  );
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
