import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  const { boardId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: board } = await supabase
    .from("mdt_boards")
    .select("practice_id")
    .eq("id", boardId)
    .maybeSingle();

  if (!board) {
    return NextResponse.json({ error: "board not found" }, { status: 404 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({
      practice_id: board.practice_id,
      board_id: boardId,
      started_by: user?.id,
    })
    .select("id")
    .single();

  if (error || !session) {
    return NextResponse.json(
      { error: error?.message ?? "failed to start session" },
      { status: 400 },
    );
  }

  const { data: patients } = await supabase
    .from("patients")
    .select("id")
    .eq("board_id", boardId)
    .neq("column_id", "COMPLETED")
    .order("created_at");

  if (patients && patients.length > 0) {
    await supabase.from("session_patients").insert(
      patients.map((p, i) => ({
        session_id: session.id,
        patient_id: p.id,
        position: i,
      })),
    );
  }

  const url = new URL(
    `/boards/${boardId}/meeting/${session.id}`,
    request.url,
  );
  return NextResponse.redirect(url, 303);
}
