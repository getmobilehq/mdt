import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="px-6 py-10">
      <main className="mx-auto w-full max-w-3xl flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">CareLoop MDT</h1>
          <p className="text-sm text-zinc-500">
            Clinical multi-disciplinary team coordination.
          </p>
        </header>
        <section className="rounded-xl border border-hairline bg-white p-6">
          <p className="text-sm text-zinc-700">
            Signed in as{" "}
            <span className="font-medium text-ink">
              {user?.email ?? "unknown"}
            </span>
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            Use the sidebar to open boards, the district nurse board, or the
            audit log.
          </p>
        </section>
      </main>
    </div>
  );
}
