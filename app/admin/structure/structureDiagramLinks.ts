export type DiagramTemplate = {
  readonly id: number;
  readonly code: string;
  readonly name: string;
};

export type PartNumberTemplateSource = {
  readonly sourceId: string;
  readonly sourceY: number;
  readonly templates: readonly DiagramTemplate[];
};

export type TemplateLinkSource = {
  readonly template: DiagramTemplate;
  readonly sourceId: string;
  readonly sourceY: number;
};

type CollectTemplateLinkSourcesInput = {
  readonly modelId: number;
  readonly modelY: number;
  readonly modelTemplates: readonly DiagramTemplate[];
  readonly partNumberSources: readonly PartNumberTemplateSource[];
};

export function collectTemplateLinkSources({
  modelId,
  modelY,
  modelTemplates,
  partNumberSources,
}: CollectTemplateLinkSourcesInput): TemplateLinkSource[] {
  const sources: TemplateLinkSource[] = [];

  for (const template of modelTemplates) {
    sources.push({ template, sourceId: `m-${modelId}`, sourceY: modelY });
  }

  for (const partNumber of partNumberSources) {
    for (const template of partNumber.templates) {
      sources.push({ template, sourceId: partNumber.sourceId, sourceY: partNumber.sourceY });
    }
  }

  return sources;
}
