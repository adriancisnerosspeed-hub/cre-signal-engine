import Link from "next/link";

type Props = { searchParams: Promise<{ message?: string }> };

export default async function AuthErrorPage({ searchParams }: Props) {
  const params = await searchParams;
  const message = params.message ? decodeURIComponent(params.message) : "Something went wrong during sign-in.";

  return (
    <main style={{ maxWidth: 440, margin: "80px auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Sign-in issue</h1>
      <p style={{ color: "var(--foreground)", opacity: 0.9, marginBottom: 24 }}>{message}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Link
          href="/login"
          style={{
            display: "inline-block",
            padding: "12px 20px",
            backgroundColor: "var(--foreground)",
            color: "var(--background)",
            textDecoration: "none",
            borderRadius: 6,
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          Back to login
        </Link>
        <Link
          href="/app"
          style={{
            display: "inline-block",
            padding: "12px 20px",
            border: "1px solid var(--foreground)",
            color: "var(--foreground)",
            textDecoration: "none",
            borderRadius: 6,
            textAlign: "center",
            opacity: 0.9,
          }}
        >
          Continue to Dashboard
        </Link>
      </div>
    </main>
  );
}
