import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UsersManager, type ManagedUser } from "./users-manager";

const ADMIN_ROLES = ["ADMIN", "PCN_ADMIN"];

type PracticeRow = {
  practice_id: string;
  role: string;
  practices: { name: string } | { name: string }[] | null;
};

function practiceName(p: PracticeRow): string {
  const pr = Array.isArray(p.practices) ? p.practices[0] : p.practices;
  return pr?.name ?? "Practice";
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ practice_id?: string }>;
}) {
  const { practice_id } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: memberships } = await supabase
    .from("practice_users")
    .select("practice_id, role, practices(name)")
    .eq("user_id", user?.id ?? "")
    .in("role", ADMIN_ROLES);

  const adminPractices = ((memberships ?? []) as PracticeRow[]).map((m) => ({
    id: m.practice_id,
    name: practiceName(m),
  }));

  if (adminPractices.length === 0) {
    return (
      <div className="px-6 py-10">
        <main className="mx-auto w-full max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="mt-3 text-sm text-zinc-500">
            You don&apos;t have admin access to any practice. User management
            requires an Admin or PCN admin role.
          </p>
        </main>
      </div>
    );
  }

  const selected =
    adminPractices.find((p) => p.id === practice_id)?.id ??
    adminPractices[0].id;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const apiUrl = process.env.MDT_API_URL ?? "http://localhost:8000";

  let users: ManagedUser[] = [];
  let loadError: string | null = null;
  try {
    const res = await fetch(`${apiUrl}/practices/${selected}/users`, {
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      cache: "no-store",
    });
    if (res.ok) {
      users = (await res.json()) as ManagedUser[];
    } else {
      loadError = `Could not load users (${res.status}).`;
    }
  } catch {
    loadError = "Could not reach the user service.";
  }

  return (
    <div className="px-6 py-10">
      <main className="mx-auto w-full max-w-4xl flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-zinc-500">
            Manage who can access this practice.
          </p>
        </header>
        <UsersManager
          practiceId={selected}
          practices={adminPractices}
          currentUserId={user?.id ?? ""}
          initialUsers={users}
          loadError={loadError}
        />
      </main>
    </div>
  );
}
