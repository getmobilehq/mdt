import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ActionsReview } from "./actions-review";

type ActionRow = {
  id: string;
  patient_id: string;
  description: string;
  owner_role: "GP" | "DN" | "ADMIN" | "SOCIAL_WORKER" | "PCN_ADMIN";
  deadline: string | null;
  confirmed: boolean;
  created_by_ai: boolean;
  human_edited: boolean;
};

type PatientRow = { id: string; full_name: string };

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, board_id, started_at, ended_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) notFound();

  const [{ data: transcript }, { data: actions }, { data: sp }] = await Promise.all([
    supabase
      .from("transcripts")
      .select("full_text, duration_s, processed_at")
      .eq("session_id", sessionId)
      .maybeSingle(),
    supabase
      .from("actions")
      .select(
        "id, patient_id, description, owner_role, deadline, confirmed, created_by_ai, human_edited",
      )
      .eq("session_id", sessionId)
      .order("created_at"),
    supabase
      .from("session_patients")
      .select("patients(id, full_name)")
      .eq("session_id", sessionId),
  ]);

  const actionRows = (actions ?? []) as ActionRow[];
  const rawSp = (sp ?? []) as unknown as { patients: PatientRow | PatientRow[] | null }[];
  const patientList: PatientRow[] = [];
  for (const r of rawSp) {
    if (!r.patients) continue;
    if (Array.isArray(r.patients)) patientList.push(...r.patients);
    else patientList.push(r.patients);
  }
  const patientById: Record<string, string> = Object.fromEntries(
    patientList.map((p) => [p.id, p.full_name]),
  );

  return (
    <div className="flex flex-1 flex-col px-6 py-10">
      <main className="mx-auto w-full max-w-4xl flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            Session review
          </h1>
          <p className="text-sm text-zinc-500">
            {new Date(session.started_at).toLocaleString()}
            {session.ended_at ? ` → ${new Date(session.ended_at).toLocaleString()}` : ""}
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium">Transcript</h2>
          {transcript ? (
            <>
              <p className="mt-1 text-xs text-zinc-500">
                {transcript.duration_s ? `${transcript.duration_s}s · ` : ""}
                processed {new Date(transcript.processed_at).toLocaleString()}
              </p>
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
                {transcript.full_text}
              </pre>
            </>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">
              No transcript yet. Transcription runs when the meeting recording
              is uploaded by the worker.
            </p>
          )}
        </section>

        <ActionsReview actions={actionRows} patientById={patientById} />
      </main>
    </div>
  );
}
