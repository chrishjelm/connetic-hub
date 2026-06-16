"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[v0] Route error boundary caught:", error);
  }, [error]);

  return (
    <div style={{ padding: "48px 36px", maxWidth: 560 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
        Something went wrong
      </h1>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)", marginBottom: 20 }}>
        This page hit an unexpected error. The rest of the app is still available.
      </p>
      {error?.message && (
        <pre
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "12px 14px",
            marginBottom: 20,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error.message}
        </pre>
      )}
      <button
        onClick={reset}
        style={{
          padding: "9px 16px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          background: "var(--accent)",
          color: "#fff",
          border: "none",
        }}
      >
        Try again
      </button>
    </div>
  );
}
