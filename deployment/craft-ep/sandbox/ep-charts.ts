// Expected Parrot study helper for Onyx Craft (global OpenCode plugin).
//
// Same mechanism as Onyx's turn-budget plugin: after a tool runs, append a
// notice to its output. Here the notice names every PNG chart created since the
// last check, with the exact inline Markdown the reply must contain, and flags
// banned share wording in files the agent just wrote. Inert when nothing changed.
// Before a tool runs, it holds Expected Parrot's plan gate: no EDSL job runs
// until the user has answered the plan (a second user message), and no
// outputs/reply.md that names a share the study cannot measure is written.

import type { Plugin } from "@opencode-ai/plugin";

const BANNED = /market share|penetration|adoption|market size|\breach\b/i;
const SKIP = /(^|\/)(node_modules|\.next|\.opencode|\.opencode-data|\.git)(\/|$)/;

export default (async ({ directory, client }) => {
  const session = directory.split("/").filter(Boolean).pop() ?? "";
  const glob = new Bun.Glob("**/*.png");
  const seen = new Set<string>();
  const argsByCall = new Map<string, unknown>();
  const userTurns = new Map<string, number>();
  let primed = false;

  // User messages so far in the session; the stored history survives a sandbox restart, the counter does not.
  async function userMessages(sessionID: string): Promise<number> {
    try {
      const res = (await client.session.messages({ path: { id: sessionID } })) as { data?: { info?: { role?: string } }[] };
      if (Array.isArray(res.data)) return res.data.filter((m) => m.info?.role === "user").length;
    } catch {}
    return userTurns.get(sessionID) ?? 2;
  }

  // True when a shell command starts an EDSL job: `.run(` inline, or in a Python script it executes.
  async function runsEdsl(command: string): Promise<boolean> {
    if (/\.run\(/.test(command)) return true;
    const cd = command.match(/(?:^|&&|;)\s*cd\s+([^\s&;]+)/);
    const base = cd ? (cd[1].startsWith("/") ? cd[1] : `${directory}/${cd[1]}`) : directory;
    for (const m of command.matchAll(/python3?\s+(?:-u\s+)?([^\s&;|]+\.py)/g)) {
      const path = m[1].startsWith("/") ? m[1] : `${base}/${m[1]}`;
      try {
        if (/\.run\(/.test(await Bun.file(path).text())) return true;
      } catch {}
    }
    return false;
  }

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
    "chat.message": async (input) => {
      userTurns.set(input.sessionID, (userTurns.get(input.sessionID) ?? 0) + 1);
    },
    "tool.execute.before": async (input, output) => {
      await prime();
      const args = (output as { args?: { command?: string; filePath?: string; content?: string; newString?: string } }).args;
      argsByCall.set(input.callID, args);
      // The reply the user reads may not name a share the study cannot measure.
      if ((input.tool === "write" || input.tool === "edit") && /(^|\/)reply\.md$/.test(args?.filePath ?? "")) {
        const hit = `${args?.content ?? ""}\n${args?.newString ?? ""}`.match(BANNED);
        if (hit) {
          throw new Error(
            `[Expected Parrot] reply.md says "${hit[0]}". Simulated respondents measure none of market share, penetration, ` +
              'adoption, market size or reach. Rewrite it as a share of simulated respondents (for example "% of simulated ' +
              'respondents who would buy") and, if the user asked for one of these, explain in other words why the study cannot give it.'
          );
        }
      }
      if (input.tool === "bash" && typeof args?.command === "string" && (await runsEdsl(args.command))) {
        if ((await userMessages(input.sessionID)) <= 1) {
          throw new Error(
            "[Expected Parrot] Plan gate: this command runs an EDSL job, but the user has not approved a plan yet. " +
              "Reply with the plan only (decision, segments, questions, model, sample size), ask for approval, and stop."
          );
        }
      }
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
