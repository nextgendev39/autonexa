"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f4f1eb",
          color: "#1c2c33",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
          <p>حدث خطأ ما</p>
          <button type="button" onClick={reset}>
            Retry · إعادة المحاولة
          </button>
        </main>
      </body>
    </html>
  );
}
