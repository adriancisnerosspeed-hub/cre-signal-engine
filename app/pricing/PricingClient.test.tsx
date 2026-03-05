/**
 * UI-level test for pricing displayPlan: when workspace is PRO+, PRO+ section
 * is active and "Buy PRO+" is not shown (Manage billing shown instead).
 * Prevents regressions from refactoring UI state handling.
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PricingClient from "./PricingClient";

// Avoid real fetch in tests
vi.mock("@/lib/fetchJsonWithTimeout", () => ({ fetchJsonWithTimeout: vi.fn() }));

describe("PricingClient displayPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Manage billing for PRO+ slot when displayPlan is pro_plus (PRO+ active, no Buy PRO+)", () => {
    render(
      <PricingClient
        displayPlan="pro_plus"
        workspaceId="org-1"
        slot="pro_plus"
      />
    );
    expect(screen.getByRole("button", { name: /Manage billing/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start Analyst Plan/i })).not.toBeInTheDocument();
  });

  it("shows Upgrade to PRO+ for PRO+ slot when displayPlan is free", () => {
    render(
      <PricingClient
        displayPlan="free"
        workspaceId="org-1"
        slot="pro_plus"
      />
    );
    expect(screen.getByRole("button", { name: /Start Analyst Plan/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Manage billing/i })).not.toBeInTheDocument();
  });

  it("shows included text for PRO+ slot when displayPlan is enterprise (no Buy PRO+ button)", () => {
    render(
      <PricingClient
        displayPlan="enterprise"
        slot="pro_plus"
      />
    );
    expect(screen.getByText(/Included in your Enterprise plan/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start Analyst Plan/i })).not.toBeInTheDocument();
  });
});
