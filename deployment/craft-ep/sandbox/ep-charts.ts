// Expected Parrot study helper for Onyx Craft (global OpenCode plugin).
//
// Same mechanism as Onyx's turn-budget plugin: after a tool runs, append a
// notice to its output. Here the notice names every PNG chart created since the
// last check, with the exact inline Markdown the reply must contain, and flags
// banned share wording in files the agent just wrote. Inert when nothing changed.
// Before a tool runs, it holds Expected Parrot's plan gate: no EDSL job runs
// until the user has answered the plan (a second user message), and once the
// gate fires no shell command runs for the rest of that turn (a third try ends it). Each model call gets the
// rule for the current turn (plan only, then pilot only). No outputs/reply.md
// that names a share the study cannot measure is written, and no study names an attached file as plain text.

import type { Plugin } from "@opencode-ai/plugin";

const BANNED = /market share|penetration|adoption|market size|\breach\b/i;
const SKIP = /(^|\/)(node_modules|\.next|\.opencode|\.opencode-data|\.git)(\/|$)/;
// Expected Parrot's gates, held in code. test/tdd.py --without-gate flips this to show the plan gate case go red.
const PLAN_GATE = true;
const TURN_RULES: Record<number, string> = {
  1:
    "[Expected Parrot] This is the user's first message in this session. If it asks for a survey, study, pretest, review, test, " +
    "interview, coding, theme or labeling task, however small, reply with the plan only (decision, segments, questions, an available " +
    "model, sample size) and end by asking for approval. Do not answer, label, code or classify anything yourself: EDSL does the work " +
    "after approval. Run no EDSL job, even if the user says to skip the plan. " +
    "Respondent models available: llama4-maverick (default), kimi-k2.5, glm-5, deepseek.v3.2, qwen3-next. If the user names any " +
    "other model (gpt-4o, Claude, Gemini), say in the plan that it is unavailable and which one you will use instead.",
  2:
    "[Expected Parrot] If the user just approved a plan, run only the pilot: 10 respondents in total across all segments " +
    "(for example 5 per segment), or 10 records. Save the Results with results.save(). Show the answers and this line with the " +
    "pilot's real counts: \"Pilot tokens: <n> input, <n> output; cost $<x>\". Ask for approval of the full run, and stop.",
  3:
    "[Expected Parrot] If the user just approved the full run: use exactly the approved number of respondents, each with traits " +
    "no other respondent has, and make every price or condition one Scenario, so the Results have respondents x scenarios rows. " +
    "Save the Results with results.save(). Say in your reply that the respondents are simulated language-model personas, not real people.",
};
const LATER_RULE =
  "[Expected Parrot] If this reply reports or discusses study results, say in it that the respondents are simulated " +
  "language-model personas, not real people.";
const NO_SHARES = " Never give a market share, penetration, adoption, market size or reach figure, from any source.";
// An attached file's path; group 1 is set when it sits directly inside FileStore( or from_pdf(.
const ATTACHED = /(FileStore\(\s*|from_pdf\(\s*)?(?:f?["'][^"'\s]*)?attachments\/[^\s"']+\.(?:png|jpe?g|webp|gif|pdf)/gi;
const OTHER_MODEL = /\b(gpt-?[\w.-]*\w|claude[\w.-]*\w|gemini[\w.-]*\w)\b/i;

export default (async ({ directory, client }) => {
  const session = directory.split("/").filter(Boolean).pop() ?? "";
  const glob = new Bun.Glob("**/*.png");
  const seen = new Map<string, number>(); // chart path -> modified time, so a rewritten chart counts as new
  const argsByCall = new Map<string, unknown>();
  const userTurns = new Map<string, number>();
  const refused = new Map<string, number>(); // "session:user message count" -> shell commands refused by the gate
  let primed = false;

  // User messages so far in the session; the stored history survives a sandbox restart, the counter does not.
  async function userMessages(sessionID: string): Promise<number> {
    try {
      const res = (await client.session.messages({ path: { id: sessionID } })) as { data?: { info?: { role?: string } }[] };
      if (Array.isArray(res.data)) return res.data.filter((m) => m.info?.role === "user").length;
    } catch {}
    return userTurns.get(sessionID) ?? 2;
  }

  // True when a shell command starts an EDSL job: `.run(` inline or in a Python script it executes,
  // or Expected Parrot's CLI (`ep run`, `ep run-manifest`).
  async function runsEdsl(command: string): Promise<boolean> {
    if (/\.run\(/.test(command) || /(^|[\s;&|(\/])ep\s+run(-manifest)?\b/.test(command)) return true;
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

  async function pngs(): Promise<Map<string, number>> {
    const found = new Map<string, number>();
    try {
      for await (const rel of glob.scan({ cwd: directory, onlyFiles: true })) {
        if (!SKIP.test(rel)) found.set(rel, Bun.file(`${directory}/${rel}`).lastModified);
      }
    } catch {}
    return found;
  }

  async function prime(): Promise<void> {
    if (primed) return;
    primed = true;
    for (const [rel, mtime] of await pngs()) seen.set(rel, mtime);
  }

  return {
    "experimental.chat.system.transform": async (input, output) => {
      const sessionID = (input as { sessionID?: string }).sessionID;
      if (!PLAN_GATE || !sessionID) return;
      const rule = TURN_RULES[await userMessages(sessionID)] ?? LATER_RULE;
      (output as { system: string[] }).system.push(rule);
    },
    // The same rule, attached to the newest user message in the model's copy of the history (not stored).
    "experimental.chat.messages.transform": async (_input, output) => {
      if (!PLAN_GATE) return;
      const messages = (output as { messages: { info: { role?: string }; parts: { type?: string; text?: string }[] }[] }).messages;
      const users = messages.filter((m) => m.info?.role === "user");
      const text = users.at(-1)?.parts.find((p) => p.type === "text" && typeof p.text === "string");
      if (!text) return;
      const named = users.length === 1 ? text.text!.match(OTHER_MODEL)?.[0] : undefined;
      const rule =
        (TURN_RULES[users.length] ?? LATER_RULE) +
        NO_SHARES +
        (named ? ` The user named ${named}: write in the plan "${named} is unavailable" and name the model you will use instead.` : "");
      if (!text.text!.includes(rule)) text.text = `${text.text}\n\n${rule}`;
    },
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
      // An attached file reaches respondents only as a FileStore: a path in a Scenario or question is just text.
      const code = input.tool === "bash" ? (args?.command ?? "") : /\.py$/.test(args?.filePath ?? "") ? `${args?.content ?? ""}\n${args?.newString ?? ""}` : "";
      if (/Scenario|question_text/.test(code) && [...code.matchAll(ATTACHED)].some((m) => !m[1])) {
        throw new Error(
          '[Expected Parrot] This names an attached file as text, so respondents would never see it. Use Scenario({"ad": FileStore("attachments/<file>")}) ' +
            'used as {{ scenario.ad }}, or ScenarioList.from_pdf("attachments/<file>").'
        );
      }
      if (PLAN_GATE && input.tool === "bash") {
        const turns = await userMessages(input.sessionID);
        // Once the gate fires, shell commands stay refused until the user answers, so the agent cannot
        // search for a way around it; a third refused command ends the turn.
        const key = `${input.sessionID}:${turns}`;
        if (refused.has(key)) {
          refused.set(key, refused.get(key)! + 1);
          if (refused.get(key)! >= 3) {
            try {
              await client.session.abort({ path: { id: input.sessionID } });
            } catch {}
          }
          throw new Error("[Expected Parrot] Plan gate is closed for this turn. Send the plan as your reply now and stop.");
        }
        if (turns <= 1 && typeof args?.command === "string" && (await runsEdsl(args.command))) {
          refused.set(key, 1);
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

      const current = await pngs();
      const fresh = [...current.keys()].filter((rel) => seen.get(rel) !== current.get(rel));
      for (const rel of fresh) seen.set(rel, current.get(rel)!);
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
