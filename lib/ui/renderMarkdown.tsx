import type { ReactNode } from "react";

export function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export function renderMarkdown(text: string): ReactNode {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("### ")) {
      return (
        <h4
          key={i}
          style={{ fontSize: 13, fontWeight: 700, color: "#f4f4f5", marginTop: 14, marginBottom: 2 }}
        >
          {renderInline(line.slice(4))}
        </h4>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h3
          key={i}
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#f4f4f5",
            marginTop: 18,
            marginBottom: 4,
            borderBottom: "1px solid rgba(255,255,255,0.15)",
            paddingBottom: 4,
          }}
        >
          {renderInline(line.slice(3))}
        </h3>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <h2
          key={i}
          style={{ fontSize: 15, fontWeight: 700, color: "#f4f4f5", marginTop: 20, marginBottom: 6 }}
        >
          {renderInline(line.slice(2))}
        </h2>
      );
    }
    if (line.trim() === "") {
      return <div key={i} style={{ height: 8 }} />;
    }
    return (
      <p key={i} style={{ margin: "3px 0", lineHeight: 1.65 }}>
        {renderInline(line)}
      </p>
    );
  });
}
