"use client";

import { useEffect, useRef, useState } from "react";
import DailyIframe, {
  type DailyCall,
} from "@daily-co/daily-js";

type TokenResponse = { token: string; room_url: string };

export function DailyFrame({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<DailyCall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "joining" | "joined">("idle");

  useEffect(() => {
    let cancelled = false;

    async function join() {
      setStatus("joining");
      setError(null);
      try {
        const res = await fetch(`/api/sessions/${sessionId}/token`, {
          method: "POST",
        });
        if (!res.ok) {
          throw new Error(`token request failed (${res.status})`);
        }
        const data = (await res.json()) as TokenResponse;
        if (cancelled || !containerRef.current) return;

        const call = DailyIframe.createFrame(containerRef.current, {
          showLeaveButton: true,
          iframeStyle: {
            width: "100%",
            height: "100%",
            border: "0",
            borderRadius: "1rem",
          },
        });
        callRef.current = call;
        await call.join({ url: data.room_url, token: data.token });
        if (!cancelled) setStatus("joined");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "failed to join call");
          setStatus("idle");
        }
      }
    }

    join();

    return () => {
      cancelled = true;
      const call = callRef.current;
      if (call) {
        call.leave().catch(() => {});
        call.destroy().catch(() => {});
        callRef.current = null;
      }
    };
  }, [sessionId]);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="aspect-video w-full overflow-hidden rounded-2xl border border-zinc-200 bg-black dark:border-zinc-800"
      />
      {status === "joining" ? (
        <p className="text-xs text-zinc-500">Joining call…</p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
