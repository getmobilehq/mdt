import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function proxy(
  method: "PATCH" | "DELETE",
  request: Request,
  userId: string,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const practiceId = new URL(request.url).searchParams.get("practiceId");
  if (!practiceId) {
    return NextResponse.json({ error: "practiceId required" }, { status: 400 });
  }

  const apiUrl = process.env.MDT_API_URL ?? "http://localhost:8000";
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  };
  if (method === "PATCH") {
    init.body = JSON.stringify(await request.json().catch(() => ({})));
  }
  const upstream = await fetch(
    `${apiUrl}/practices/${practiceId}/users/${userId}`,
    init,
  );
  const text = await upstream.text();
  return new NextResponse(text || "{}", {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  return proxy("PATCH", request, userId);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  return proxy("DELETE", request, userId);
}
