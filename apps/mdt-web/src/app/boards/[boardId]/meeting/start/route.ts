import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Start an MDT meeting.
 *
 * Delegates to the API's POST /sessions, which is the single source of
 * truth: it creates the session, snapshots patients, provisions the
 * Daily.co room (sets daily_room_url/daily_room_name) and writes audit.
 * Doing the Supabase insert here directly skipped Daily room creation,
 * so the meeting page rendered no video/audio.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  const { boardId } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();

  if (!authSession) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const apiUrl = process.env.MDT_API_URL ?? "http://localhost:8000";
  const upstream = await fetch(`${apiUrl}/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authSession.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ board_id: boardId }),
    cache: "no-store",
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return new NextResponse(
      text || JSON.stringify({ error: "failed to start session" }),
      { status: upstream.status, headers: { "content-type": "application/json" } },
    );
  }

  const session = (await upstream.json()) as { id: string };
  const url = new URL(`/boards/${boardId}/meeting/${session.id}`, request.url);
  return NextResponse.redirect(url, 303);
}
