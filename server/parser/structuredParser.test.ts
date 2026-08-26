import { describe, expect, it } from "vitest";
import { parseStructuredValues } from "./structuredParser";

describe("normalização estruturada", () => {
  it("extrai chaves e valores de JSON sem executar conteúdo", () => {
    const values = parseStructuredValues("network.json", '{"proxy":{"host":"dash-proxy","enabled":true}}');
    expect(values).toContainEqual({ path: "JSON.proxy.host", key: "host", value: "dash-proxy" });
    expect(values).toContainEqual({ path: "JSON.proxy.enabled", key: "enabled", value: "true" });
  });

  it("extrai valores de XML relevante", () => {
    const values = parseStructuredValues("profile.xml", "<profile><network><proxy>dash-proxy</proxy></network></profile>");
    expect(values).toContainEqual({ path: "XML.profile.network.proxy", key: "proxy", value: "dash-proxy" });
  });
});
