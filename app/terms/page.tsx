import Link from "next/link";

export const metadata = {
  title: "Terms of Service | CRE Signal Engine",
  description: "Terms of Service for CRE Signal Engine",
};

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa", marginBottom: 8 }}>
        Terms of Service
      </h1>
      <p style={{ color: "#a1a1aa", marginBottom: 24 }}>
        Last updated: {new Date().toISOString().slice(0, 10)}
      </p>
      <div style={{ color: "#e4e4e7", fontSize: 15, lineHeight: 1.6 }}>
        <p>
          By using CRE Signal Engine you agree to use the service in accordance with these terms.
          We reserve the right to update these terms; continued use constitutes acceptance.
        </p>
        <p style={{ marginTop: 16 }}>
          For billing and subscription terms, see your plan and our payment provider&apos;s policies.
        </p>
      </div>
      <p style={{ marginTop: 32 }}>
        <Link href="/" style={{ color: "#3b82f6", fontSize: 14 }}>
          Back to home
        </Link>
      </p>
    </main>
  );
}
