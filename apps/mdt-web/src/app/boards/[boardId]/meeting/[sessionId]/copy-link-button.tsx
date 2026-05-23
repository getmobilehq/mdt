"use client";

import { useState } from "react";

/**
 * Copies the in-app meeting URL so a stakeholder who isn't in the room can be
 * invited. The Daily room is private, so we share the app page (not the raw
 * room URL) — recipients sign in and mint their own join token in-app.
 */
export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard needs a secure context; nothing else we can safely do here.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
    >
      {copied ? "Link copied ✓" : "Copy join link"}
    </button>
  );
}
