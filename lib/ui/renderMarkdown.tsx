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
          className="text-[13px] font-bold text-gray-900 dark:text-zinc-100 mt-3.5 mb-0.5"
        >
          {renderInline(line.slice(4))}
        </h4>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h3
          key={i}
          className="text-sm font-bold text-gray-900 dark:text-zinc-100 mt-4 mb-1 border-b border-gray-300 dark:border-white/[0.15] pb-1"
        >
          {renderInline(line.slice(3))}
        </h3>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <h2
          key={i}
          className="text-[15px] font-bold text-gray-900 dark:text-zinc-100 mt-5 mb-1.5"
        >
          {renderInline(line.slice(2))}
        </h2>
      );
    }
    if (line.trim() === "") {
      return <div key={i} style={{ height: 8 }} />;
    }
    return (
      <p key={i} className="text-gray-800 dark:text-zinc-200" style={{ margin: "3px 0", lineHeight: 1.65 }}>
        {renderInline(line)}
      </p>
    );
  });
}
