// Expected Parrot study helper for Onyx Craft (global OpenCode plugin).
//
// Same mechanism as Onyx's turn-budget plugin: after a tool runs, append a
// notice to its output. Here the notice names every PNG chart created since the
// last check, with the exact inline Markdown the reply must contain, and flags
// banned share wording in files the agent just wrote. Inert when nothing changed.

import type { Plugin } from "@opencode-ai/plugin";

const BANNED = /market share|penetration|adoption|market size|\breach\b/i;
const SKIP = /(^|\/)(node_modules|\.next|\.opencode|\.opencode-data|\.git)(\/|$)/;

export default (async ({ directory }) => {
  const session = directory.split("/").filter(Boolean).pop() ?? "";
  const glob = new Bun.Glob("**/*.png");
  const seen = new Set<string>();
  const argsByCall = new Map<string, unknown>();
  let primed = false;

  async function pngs(): Promise<string[]> {
    const found: string[] = [];
    try {
      for await (const rel of glob.scan({ cwd: directory, onlyFiles: true })) {
        if (!SKIP.test(rel)) found.push(rel);
      }
    } catch {
      return [];
    }
    return found;
  }

  async function prime(): Promise<void> {
    if (primed) return;
    primed = true;
    for (const rel of await pngs()) seen.add(rel);
  }

  return {
    "tool.execute.before": async (input, output) => {
      await prime();
      argsByCall.set(input.callID, (output as { args?: unknown }).args);
    },
    "tool.execute.after": async (input, output) => {
      if (!output) return;
      const notes: string[] = [];

      const fresh = (await pngs()).filter((rel) => !seen.has(rel));
      for (const rel of fresh) seen.add(rel);
      const inGraphs = fresh.filter((rel) => rel.startsWith("outputs/graphs/"));
      const elsewhere = fresh.filter((rel) => !rel.startsWith("outputs/graphs/"));
      if (inGraphs.length) {
        notes.push(
          "[Expected Parrot] New chart(s) saved. Your reply must show each one inline, exactly:\n" +
            inGraphs
              .map((rel) => {
                const title = rel.split("/").pop()!.replace(/\.png$/, "").replace(/[_-]+/g, " ");
                return `![${title}](/api/build/sessions/${session}/artifacts/${rel})`;
              })
              .join("\n")
        );
      }
      if (elsewhere.length) {
        notes.push(
          "[Expected Parrot] Chart(s) saved outside outputs/graphs/: " +
            elsewhere.join(", ") +
            ". Move them to outputs/graphs/ so they can be shown inline."
        );
      }

      const args = argsByCall.get(input.callID);
      argsByCall.delete(input.callID);
      const written = JSON.stringify(args ?? "");
      if (BANNED.test(written) && !/grep\s+-[a-z]*E/.test(written)) {
        notes.push(
          "[Expected Parrot] What you just wrote says market share, penetration, adoption, market size or reach. " +
            "Simulated respondents measure none of these. Rewrite it as a share of simulated respondents " +
            '(for example "% of simulated respondents who subscribe") in prose, chart titles and table headers.'
        );
      }

      if (!notes.length) return;
      const notice = notes.join("\n\n");
      output.output = `${output.output ?? ""}\n\n${notice}`;
      const content = (output as { content?: unknown }).content;
      if (Array.isArray(content)) content.push({ type: "text", text: notice });
    },
  };
}) satisfies Plugin;
