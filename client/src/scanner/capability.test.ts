import { describe, expect, it } from "vitest";
import { createScanPlan } from "./capability";

describe("planejamento adaptativo do scanner", () => {
  it("usa perfil controlado quando Safari não expõe memória", () => {
    const plan = createScanPlan(1024 * 1024 * 1024, { mobile: true, hardwareConcurrency: 4 });
    expect(plan.level).toBe("low");
    expect(plan.chunkBytes).toBe(256 * 1024);
    expect(plan.fallback).toBe(true);
  });

  it("aumenta o tamanho do chunk somente quando os recursos são informados", () => {
    const medium = createScanPlan(1024 * 1024 * 1024, { mobile: false, deviceMemory: 4, hardwareConcurrency: 4 });
    const high = createScanPlan(1024 * 1024 * 1024, { mobile: false, deviceMemory: 8, hardwareConcurrency: 8 });
    expect(medium.level).toBe("medium");
    expect(high.level).toBe("high");
    expect(high.chunkBytes).toBeGreaterThan(medium.chunkBytes);
  });

  it("define proteção por expansão estrutural, não por bloqueio fixo do arquivo", () => {
    const small = createScanPlan(100 * 1024 * 1024, { mobile: false, deviceMemory: 8, hardwareConcurrency: 8 });
    const large = createScanPlan(2 * 1024 * 1024 * 1024, { mobile: false, deviceMemory: 8, hardwareConcurrency: 8 });
    expect(large.maxExpandedBytes).toBeGreaterThanOrEqual(small.maxExpandedBytes);
    expect(large.maxExpandedBytes).toBeGreaterThan(1024 * 1024 * 1024);
  });
});
