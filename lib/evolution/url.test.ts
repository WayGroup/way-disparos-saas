import { describe, it, expect } from "vitest";
import { evoUrl } from "@/lib/evolution/url";

describe("evoUrl", () => {
  it("junta base e path", () => {
    expect(evoUrl("https://evo.way.com", "/instance/connect/way")).toBe(
      "https://evo.way.com/instance/connect/way",
    );
  });

  it("remove barra final da base", () => {
    expect(evoUrl("https://evo.way.com/", "/x")).toBe("https://evo.way.com/x");
    expect(evoUrl("https://evo.way.com///", "/x")).toBe("https://evo.way.com/x");
  });

  it("aceita path sem barra inicial", () => {
    expect(evoUrl("https://evo.way.com", "x/y")).toBe("https://evo.way.com/x/y");
  });

  it("preserva subpath da base", () => {
    expect(evoUrl("https://way.com/evolution", "/instance/connect/way")).toBe(
      "https://way.com/evolution/instance/connect/way",
    );
  });

  it("preserva query string", () => {
    expect(evoUrl("https://evo.way.com/", "/group/fetchAllGroups/way?getParticipants=false")).toBe(
      "https://evo.way.com/group/fetchAllGroups/way?getParticipants=false",
    );
  });
});
