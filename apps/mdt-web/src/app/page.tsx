import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <main className="w-full max-w-xl flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            CareLoop MDT
          </h1>
          <p className="text-sm text-zinc-500">
            Clinical Multi-Disciplinary Team coordination.
          </p>
        </header>
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm">
            Signed in as{" "}
            <span className="font-medium">{user?.email ?? "unknown"}</span>
          </p>
          <form action="/auth/signout" method="post" className="mt-4">
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Sign out
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
