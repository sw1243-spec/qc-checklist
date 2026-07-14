import { describe, expect, it } from "vitest";
import { collectTemplateLinkSources, type DiagramTemplate } from "./structureDiagramLinks";

const template = (id: number, name: string): DiagramTemplate => ({
  id,
  code: `T-${id}`,
  name,
});

describe("collectTemplateLinkSources - common template links", () => {
  it("includes model-level templates even when part numbers exist", () => {
    const commonTemplate = template(1, "Common check sheet");
    const pnTemplate = template(2, "PN-only check sheet");

    const sources = collectTemplateLinkSources({
      modelId: 10,
      modelY: 120,
      modelTemplates: [commonTemplate],
      partNumberSources: [
        {
          sourceId: "pn-100",
          sourceY: 60,
          templates: [pnTemplate],
        },
      ],
    });

    expect(sources).toEqual([
      { template: commonTemplate, sourceId: "m-10", sourceY: 120 },
      { template: pnTemplate, sourceId: "pn-100", sourceY: 60 },
    ]);
  });
});
