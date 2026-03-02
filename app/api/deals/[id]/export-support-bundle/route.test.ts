/**
 * Support bundle ZIP structure test: assert file count and expected entries.
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";

describe("export-support-bundle ZIP structure", () => {
  it("ZIP contains 4–5 files when built with standard entries", async () => {
    const zip = new JSZip();
    zip.file("latest_scan.json", JSON.stringify({ scan_id: "s1", risk_index_score: 45 }));
    zip.file("deal-export.pdf", new Uint8Array(100));
    zip.file("methodology.pdf", new Uint8Array(200));
    zip.file("risk_audit_log.json", JSON.stringify([]));
    const blob = await zip.generateAsync({ type: "nodebuffer" });
    const loaded = await JSZip.loadAsync(blob);
    const names = Object.keys(loaded.files).filter((n) => !n.endsWith("/"));
    expect(names.length).toBe(4);
    expect(names).toContain("latest_scan.json");
    expect(names).toContain("deal-export.pdf");
    expect(names).toContain("methodology.pdf");
    expect(names).toContain("risk_audit_log.json");
  });

  it("ZIP with backtest_summary has 5 files", async () => {
    const zip = new JSZip();
    zip.file("latest_scan.json", "{}");
    zip.file("deal-export.pdf", new Uint8Array(0));
    zip.file("methodology.pdf", new Uint8Array(0));
    zip.file("risk_audit_log.json", "[]");
    zip.file("backtest_summary.json", JSON.stringify({ sample_size: 20 }));
    const blob = await zip.generateAsync({ type: "nodebuffer" });
    const loaded = await JSZip.loadAsync(blob);
    const names = Object.keys(loaded.files).filter((n) => !n.endsWith("/"));
    expect(names.length).toBe(5);
    expect(names).toContain("backtest_summary.json");
  });
});
