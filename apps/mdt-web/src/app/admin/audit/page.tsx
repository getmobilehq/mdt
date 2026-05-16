import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AuditRow = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  practice_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ practice_id?: string }>;
}) {
  const { practice_id } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: practices } = await supabase
    .from("practices")
    .select("id, name")
    .order("name");

  let rows: AuditRow[] = [];
  const selected = practice_id ?? practices?.[0]?.id ?? null;

  if (selected) {
    const { data } = await supabase
      .from("audit_log_with_actor")
      .select(
        "id, action, resource_type, resource_id, practice_id, metadata, created_at, actor_name, actor_email",
      )
      .eq("practice_id", selected)
      .order("created_at", { ascending: false })
      .limit(200);
    rows = (data ?? []) as AuditRow[];
  }

  return (
    <div className="flex flex-1 flex-col px-6 py-10">
      <main className="mx-auto w-full max-w-5xl flex flex-col gap-6">
        <header>
          <Link
            href="/"
            className="text-xs uppercase tracking-wide text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          >
            ← Home
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-zinc-500">
            Append-only record of every write action. Practice admins only.
          </p>
        </header>
        <form className="flex items-center gap-3 text-sm">
          <label className="font-medium">Practice</label>
          <select
            name="practice_id"
            defaultValue={selected ?? ""}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {(practices ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            Load
          </button>
        </form>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No audit entries visible. You must be an admin of the selected practice.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Resource</th>
                  <th className="px-3 py-2">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.actor_name ?? r.actor_email ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-500">
                      {r.resource_type}
                      {r.resource_id ? ` · ${r.resource_id.slice(0, 8)}` : ""}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-500">
                      {Object.keys(r.metadata).length > 0
                        ? JSON.stringify(r.metadata)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
