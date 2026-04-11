import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();

  if (!authSession) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const apiUrl = process.env.MDT_API_URL ?? "http://localhost:8000";
  const upstream = await fetch(`${apiUrl}/sessions/${sessionId}/token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authSession.access_token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    cache: "no-store",
  });

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
