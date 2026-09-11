"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Text } from "@opal/components";
import CommandMenu from "@/refresh-components/commandmenu/CommandMenu";

// Kokonut action-search pattern, composed with native Onyx keyboard and focus handling.
// Reference: design-system/registry/components/action-search-bar.tsx (MIT).
const actions = [
  {
    label: "actions.findEvidence" as const,
    description: "Search available files and internal research",
    prompt:
      "Find relevant customer evidence in the available attachments, project files and internal research. Cite the original sources. Separate customer statements from interpretation and identify contradictory evidence. Missing evidence remains unknown.",
  },
  {
    label: "actions.researchMarket" as const,
    description: "Public research with sources",
    prompt:
      "Use GPT Researcher for material public market context relevant to the business decision. Research public company and category facts only. Exclude private targets, email addresses and transcripts from external queries. Cite original sources.",
  },
  {
    label: "actions.checkModel" as const,
    description: "Journey, objectives and unsupported assumptions",
    prompt:
      "Review the customer journey and OKRs against the saved executive evidence. Identify unsupported inputs, contradictions and assumptions capable of changing the decision. Propose only material corrections. Keep unknown numbers and deadlines unknown.",
  },
  {
    label: "actions.designExperiment" as const,
    description: "Turn a consequential uncertainty into a draft",
    prompt:
      "Use the Subconscious experiment tools to design a draft for the most consequential customer behavior uncertainty. Connect the intervention, outcome and alternatives to the business objective. Explain the evidence required. Do not start an experiment.",
  },
  {
    label: "actions.analyzeExperiment" as const,
    description: "Inspect a saved experiment and explain implications",
    prompt:
      "Analyze the existing Subconscious experiment identified in this conversation. If the experiment ID is missing, request the experiment ID. Retrieve actual results with the experiment tools, separate simulated evidence from observed behavior, and explain the decision implications. Do not create or start another experiment.",
  },
  {
    label: "actions.analyzeData" as const,
    description: "Calculate and chart available data with Python",
    prompt:
      "Use Python to analyze the attached or available project dataset for the business objective. Check columns, units, missing values and denominators. Produce a useful chart with calculation receipts. If no dataset is available, request a file. Do not invent operating numbers.",
  },
];

export default function BecaActions({
  onDraft,
}: {
  onDraft: (message: string) => void;
}) {
  const t = useTranslations("executive");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = actions.filter((action) =>
    `${t(action.label)} ${action.description}`
      .toLowerCase()
      .includes(query.toLowerCase().trim())
  );
  return (
    <>
      <Button
        prominence="tertiary"
        size="sm"
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
      >
        {t("actions.open")}
      </Button>
      <CommandMenu open={open} onOpenChange={setOpen}>
        <CommandMenu.Content>
          <CommandMenu.Header
            placeholder={t("actions.search")}
            value={query}
            onValueChange={setQuery}
            onClose={() => setOpen(false)}
          />
          <CommandMenu.List emptyMessage={t("actions.empty")}>
            {filtered.map((action) => (
              <CommandMenu.Item
                key={t(action.label)}
                value={t(action.label)}
                onSelect={() => {
                  setOpen(false);
                  onDraft(action.prompt);
                }}
                rightContent={
                  <Text font="secondary-body" color="text-03">
                    {t("actions.draft")}
                  </Text>
                }
              >
                {t(action.label)}
              </CommandMenu.Item>
            ))}
          </CommandMenu.List>
          <CommandMenu.Footer
            leftActions={
              <Text font="secondary-body" color="text-03">
                {t("actions.review")}
              </Text>
            }
          />
        </CommandMenu.Content>
      </CommandMenu>
    </>
  );
}
