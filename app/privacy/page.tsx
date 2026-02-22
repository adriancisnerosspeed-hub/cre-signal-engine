import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | CRE Signal Engine",
  description: "Privacy Policy for CRE Signal Engine",
};

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa", marginBottom: 8 }}>
        Privacy Policy
      </h1>
      <p style={{ color: "#a1a1aa", marginBottom: 24 }}>
        Last updated: {new Date().toISOString().slice(0, 10)}
      </p>
      <div style={{ color: "#e4e4e7", fontSize: 15, lineHeight: 1.6 }}>
        <p>
          We collect only what is needed to provide the service: account information, usage data,
          and content you submit for analysis. We do not sell your data.
        </p>
        <p style={{ marginTop: 16 }}>
          Authentication and data storage are handled by Supabase; payments by Stripe.
          See their respective privacy policies for details.
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
