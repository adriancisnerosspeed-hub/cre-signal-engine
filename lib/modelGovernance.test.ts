import { describe, it, expect } from "vitest";
import { getRiskModelMetadata } from "./modelGovernance";

describe("modelGovernance", () => {
  it("getRiskModelMetadata returns stable snapshot; changing any ramp constant fails this test", () => {
    const metadata = getRiskModelMetadata();
    expect(metadata).toMatchSnapshot();
  });
});
