import Link from "next/link";

export default function RootNotFound() {
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
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Page not found</h1>
          <p style={{ marginTop: 0 }}>الصفحة غير موجودة</p>
          <Link href="/login">Sign in</Link>
        </main>
      </body>
    </html>
  );
}
