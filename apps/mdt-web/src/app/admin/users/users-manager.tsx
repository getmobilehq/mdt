"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ManagedUser = {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
};

type Practice = { id: string; name: string };

const ROLES = [
  { id: "GP", label: "GP" },
  { id: "DN", label: "District nurse" },
  { id: "SOCIAL_WORKER", label: "Social worker" },
  { id: "ADMIN", label: "Admin" },
  { id: "PCN_ADMIN", label: "PCN admin" },
] as const;

function roleLabel(id: string): string {
  return ROLES.find((r) => r.id === id)?.label ?? id;
}

export function UsersManager({
  practiceId,
  practices,
  currentUserId,
  initialUsers,
  loadError,
}: {
  practiceId: string;
  practices: Practice[];
  currentUserId: string;
  initialUsers: ManagedUser[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(loadError);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("GP");
  const [created, setCreated] = useState<{
    email: string;
    password: string | null;
  } | null>(null);

  async function call(url: string, init: RequestInit): Promise<unknown> {
    setError(null);
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (data as { detail?: string; error?: string }).detail ??
          (data as { error?: string }).error ??
          `Request failed (${res.status})`,
      );
    }
    return data;
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = (await call("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practiceId, email, full_name: fullName, role }),
      })) as { email: string; temporary_password: string | null };
      setCreated({
        email: data.email,
        password: data.temporary_password ?? null,
      });
      setEmail("");
      setFullName("");
      setRole("GP");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create user");
    } finally {
      setBusy(false);
    }
  }

  async function onChangeRole(userId: string, newRole: string) {
    setBusy(true);
    try {
      await call(`/api/admin/users/${userId}?practiceId=${practiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update role");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(u: ManagedUser) {
    if (
      !confirm(`Remove ${u.full_name || u.email} from this practice?`)
    )
      return;
    setBusy(true);
    try {
      await call(`/api/admin/users/${u.user_id}?practiceId=${practiceId}`, {
        method: "DELETE",
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove user");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {practices.length > 1 ? (
        <label className="flex flex-col gap-1 text-sm max-w-xs">
          <span className="font-medium">Practice</span>
          <select
            value={practiceId}
            onChange={(e) =>
              router.push(`/admin/users?practice_id=${e.target.value}`)
            }
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            {practices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {created ? (
        <div className="rounded-xl border border-eucalyptus-600 bg-eucalyptus-50 p-4 text-sm">
          <p className="font-medium text-ink">User created.</p>
          <p className="mt-1 text-zinc-700">
            Send these credentials to the user securely. The password is shown
            once.
          </p>
          <p className="mt-2 font-mono text-ink">{created.email}</p>
          <p className="font-mono text-ink">
            {created.password ?? "(existing user — password unchanged)"}
          </p>
          <button
            type="button"
            onClick={() => setCreated(null)}
            className="mt-3 rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
          >
            Done
          </button>
        </div>
      ) : null}

      <form
        onSubmit={onCreate}
        className="rounded-xl border border-hairline bg-white p-4 flex flex-col gap-3"
      >
        <h2 className="text-lg font-medium">Add user</h2>
        <div className="flex flex-wrap gap-3">
          <input
            required
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 min-w-[200px] rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
          <input
            required
            type="text"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="flex-1 min-w-[200px] rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? "Working…" : "Add user"}
          </button>
        </div>
      </form>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="rounded-xl border border-hairline bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-zinc-500">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {initialUsers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                  No users in this practice yet.
                </td>
              </tr>
            ) : (
              initialUsers.map((u) => (
                <tr key={u.user_id} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-2.5">{u.full_name || "—"}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <select
                      value={u.role}
                      disabled={busy}
                      onChange={(e) => onChangeRole(u.user_id, e.target.value)}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                      aria-label={`Role for ${u.email}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {u.user_id === currentUserId ? (
                      <span className="text-xs text-zinc-400">You</span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRemove(u)}
                        className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm hover:bg-zinc-100 disabled:opacity-60"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500">
        Removing a user revokes their access to this practice; their account
        and history are kept. {roleLabel("ADMIN")} and{" "}
        {roleLabel("PCN_ADMIN")} can manage users.
      </p>
    </div>
  );
}
