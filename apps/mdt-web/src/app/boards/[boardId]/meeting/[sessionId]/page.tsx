import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CopyLinkButton } from "./copy-link-button";
import { DailyFrame } from "./daily-frame";
import { MeetingRunner } from "./meeting-runner";

type PatientSnap = {
  position: number;
  patient: {
    id: string;
    full_name: string;
    nhs_number: string;
    summary: string | null;
    source: string;
  } | null;
};

function redactNhs(nhs: string): string {
  const d = nhs.replace(/\D/g, "");
  return d.length >= 4 ? `••• ${d.slice(-4)}` : "•••";
}

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ boardId: string; sessionId: string }>;
}) {
  const { boardId, sessionId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, board_id, started_at, ended_at, daily_room_url, daily_room_name")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) notFound();

  const { data: rows } = await supabase
    .from("session_patients")
    .select(
      "position, patient:patients(id, full_name, nhs_number, summary, source)",
    )
    .eq("session_id", sessionId)
    .order("position");

  const entries = ((rows ?? []) as unknown as PatientSnap[])
    .filter((r) => r.patient)
    .map((r) => ({
      position: r.position,
      id: r.patient!.id,
      full_name: r.patient!.full_name,
      nhs_last4: redactNhs(r.patient!.nhs_number),
      summary: r.patient!.summary,
      source: r.patient!.source,
    }));

  return (
    <div className="flex flex-1 flex-col px-6 py-8">
      <main className="mx-auto w-full max-w-4xl flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Meeting in progress
            </h1>
            <p className="text-sm text-zinc-500">
              Started {new Date(session.started_at).toLocaleString()} ·{" "}
              {entries.length} patients
            </p>
          </div>
          <CopyLinkButton />
        </header>
        {session.daily_room_url ? <DailyFrame sessionId={sessionId} /> : null}
        {entries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No patients in the meeting queue.
          </p>
        ) : (
          <MeetingRunner sessionId={sessionId} boardId={boardId} entries={entries} />
        )}
      </main>
    </div>
  );
}
