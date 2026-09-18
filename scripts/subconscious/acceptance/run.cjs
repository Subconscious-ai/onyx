/** Real browser acceptance. No route mocks, auth bypass, account provisioning or paid studies. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");
const {
  jsonResponse,
  isolationResult,
  coverage,
  calculatedCellMatches,
  unknownModelInputs,
} = require("./checks.cjs");
const root = path.resolve(__dirname, "../../..");
const cases = require("../prototype_cases.json");
const blocked = (message) =>
  Object.assign(new Error(message), { blocked: true });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const targets = { software: 15000, ice_cream: 12000000, services: 6 };
const briefRules = {
  software: { target_requires: "15[ ,]?000|15k" },
  ice_cream: {
    target_requires: "12[ ,]?000[ ,]?000|12 million",
    target_forbidden: "10[ ,]?000[ ,]?000|10 million",
    unknown_inputs: ["shopper", "conversion"],
  },
  services: {
    target_requires: "six|6",
    unknown_inputs: ["meeting|volume", "conversion"],
  },
};
async function json(response) {
  return jsonResponse(
    response.status(),
    response.headers()["content-type"] || "",
    await response.text(),
  );
}
function assess(
  turn,
  answer,
  previous,
  prepared,
  transcript,
  after = transcript,
) {
  // Reuse the native evaluator instead of introducing a second interview rubric.
  const code = `import sys,json; sys.path.insert(0,sys.argv[1]); from eval_interview import Turn,assess,assess_prepared\nx=json.load(sys.stdin); t=Turn(**x['turn']); f=assess(t,x['answer'],x['previous']); f += assess_prepared(t,x['transcript'],x['after'],x['prepared']) if x['prepared'] else []; print(json.dumps(f))`;
  const result = spawnSync(
    "python3",
    ["-c", code, path.resolve(__dirname, "..")],
    {
      input: JSON.stringify({
        turn,
        answer,
        previous,
        prepared,
        transcript,
        after,
      }),
      encoding: "utf8",
      timeout: 10000,
    },
  );
  assert.equal(result.status, 0, "Existing interview evaluator must run");
  return JSON.parse(result.stdout);
}
async function main() {
  assert(process.argv[2], "Usage: node run.cjs /absolute/private-config.json");
  const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  assert(
    config.syntheticApproved === true,
    "Explicit synthetic-write configuration required",
  );
  assert(
    path.isAbsolute(config.output),
    "Use an absolute private output directory",
  );
  assert(
    !config.output.startsWith(root + path.sep),
    "Keep receipts outside Git",
  );
  process.umask(0o077);
  fs.mkdirSync(config.output, { recursive: true, mode: 0o700 });
  const out = path.join(config.output, randomUUID());
  fs.mkdirSync(out, { mode: 0o700 });
  const report = {
    startedAt: new Date().toISOString(),
    source: spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).stdout.trim(),
    testedOrigin: config.burnOrigin,
    deployment: config.deployment || "unverified",
    checks: [],
    cases: [],
    isolation: [],
    limits: [
      "Fresh native SSO uses an existing Auth0 session or dedicated synthetic credentials; customer password recovery is not tested.",
      "Scripted reading/answer time is a proxy, not measured executive minutes.",
      "Pattern checks detect known interview defects; they are not exhaustive factuality review.",
      "Read/search denial matrix is not complete enterprise authorization certification.",
    ],
  };
  const save = () =>
    fs.writeFileSync(
      path.join(out, "report.json"),
      JSON.stringify(report, null, 2),
      { mode: 0o600 },
    );
  async function check(name, action) {
    const started = Date.now();
    try {
      const evidence = await action();
      report.checks.push({
        name,
        status: "passed",
        seconds: (Date.now() - started) / 1000,
        evidence,
      });
      return evidence;
    } catch (error) {
      report.checks.push({
        name,
        status: error.blocked ? "blocked" : "failed",
        seconds: (Date.now() - started) / 1000,
        reason: error.blocked ? error.message : error.name,
        diagnostic: String(error.message).slice(0, 3000),
      });
      return null;
    } finally {
      save();
      const { diagnostic, ...summary } = report.checks.at(-1);
      console.log(JSON.stringify(summary));
    }
  }
  const load = createRequire(
    path.join(
      config.playwrightPackageRoot || path.join(root, "web"),
      "package.json",
    ),
  );
  const { chromium } = load("@playwright/test");
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(config.executablePath
        ? { executablePath: config.executablePath }
        : {}),
    });
  } catch (error) {
    report.setup = {
      status: "blocked",
      reason:
        "Browser launch failed; install the pinned Playwright browser or configure executablePath",
      errorName: error.name,
    };
    report.passed = false;
    save();
    console.log(
      JSON.stringify({
        report: path.join(out, "report.json"),
        passed: false,
        setup: report.setup,
      }),
    );
    process.exitCode = 1;
    return;
  }
  const accounts = {};
  try {
    for (const name of ["A", "B"]) {
      await check(`account-${name}`, async () => {
        const account = config.accounts?.[name];
        if (!account?.state || !fs.existsSync(account.state))
          throw blocked(`Account ${name} browser state missing`);
        const context = await browser.newContext({
          storageState: account.state,
          viewport: { width: 390, height: 844 },
        });
        const page = await context.newPage();
        accounts[name] = { context, page };
        // Drop only this browser copy of the native cookie. Do not revoke a real user's session.
        await context.clearCookies({
          name: config.nativeSessionCookie || "fastapiusersauth",
        });
        const callbacks = [];
        page.on("response", (response) => {
          const url = new URL(response.url());
          if (
            url.pathname.includes("/auth/oidc/") &&
            url.pathname.endsWith("/callback")
          )
            callbacks.push({ origin: url.origin, status: response.status() });
        });
        const allowed = [config.burnOrigin, ...(config.callbackOrigins || [])];
        await page.goto(config.burnOrigin + "/auth/login", {
          waitUntil: "domcontentloaded",
        });
        if (new URL(page.url()).hostname === "vercel.com")
          throw blocked(
            `Account ${name} requires authorized Vercel preview access before native sign-in`,
          );
        await page
          .getByRole("button", {
            name: config.ssoButtonName || "Subconscious account",
            exact: true,
          })
          .click({ timeout: 20000 });
        if (account.credentialsFile) {
          const credentials = JSON.parse(
            fs.readFileSync(account.credentialsFile, "utf8"),
          )[name];
          assert(
            /^burn-qa-[ab]-[a-f0-9]+@example\.com$/.test(credentials.email),
            "Only dedicated synthetic credentials are accepted",
          );
          try {
            await page.waitForURL(
              (url) =>
                (allowed.includes(url.origin) && url.pathname === "/app") ||
                url.hostname ===
                  (config.identityHost || "auth.subconscious.ai"),
            );
            if (!allowed.includes(new URL(page.url()).origin)) {
              await page
                .locator('input[name="username"]')
                .fill(credentials.email, { timeout: 10000 });
              await page
                .getByRole("button", { name: "Continue", exact: true })
                .click();
              await page
                .locator('input[type="password"]:visible')
                .fill(credentials.password);
              await page
                .getByRole("button", { name: "Continue", exact: true })
                .click();
            }
          } catch {
            // Do not retain credential-bearing Playwright call logs.
            if (!allowed.includes(new URL(page.url()).origin))
              throw blocked(
                `Account ${name} synthetic Auth0 sign-in needs attention`,
              );
          }
        }
        try {
          await page.waitForURL(
            (url) => allowed.includes(url.origin) && url.pathname === "/app",
            { timeout: 30000 },
          );
        } catch (error) {
          if (
            new URL(page.url()).hostname ===
            (config.identityHost || "auth.subconscious.ai")
          )
            throw blocked(
              `Account ${name} requires an interactive Auth0 sign-in`,
            );
          throw error;
        }
        assert(
          callbacks.some(
            (r) =>
              allowed.includes(r.origin) && r.status >= 200 && r.status < 400,
          ),
          "A fresh native OIDC callback must complete",
        );
        const actualOrigin = new URL(page.url()).origin;
        assert(allowed.includes(actualOrigin), "Unexpected callback origin");
        const response = await context.request.get(actualOrigin + "/api/me", {
          maxRedirects: 0,
        });
        if (
          response.status() !== 200 ||
          !(response.headers()["content-type"] || "").includes(
            "application/json",
          )
        )
          throw blocked(`Account ${name} requires native sign-in`);
        const identity = await json(response);
        assert(identity.id, "Native account identity required");
        if (account.expectedUserId)
          assert.equal(identity.id, account.expectedUserId);
        await page
          .locator("#onyx-chat-input-textbox")
          .waitFor({ timeout: 20000 });
        Object.assign(accounts[name], {
          id: identity.id,
          origin: actualOrigin,
          authenticated: true,
        });
        await context.storageState({ path: account.state });
        return {
          userId: identity.id,
          origin: actualOrigin,
          freshNativeSso: true,
          callbacks,
        };
      });
    }
    const a = accounts.A;
    await check("one-front-door-phone-and-desktop", async () => {
      if (!a?.authenticated) throw blocked("Account A login required");
      for (const width of [390, 1440]) {
        await a.page.setViewportSize({ width, height: 844 });
        await a.page.goto(a.origin + "/app", { waitUntil: "domcontentloaded" });
        await a.page.locator("#onyx-chat-input-textbox").waitFor();
        assert.equal(
          await a.page
            .getByRole("button", {
              name: /^Actions$|choose.*agent|select.*model/i,
            })
            .filter({ visible: true })
            .count(),
          0,
          "Workflow/model controls must be absent",
        );
        assert.equal(
          await a.page
            .getByRole("link", { name: /^Experiment (design|analytics)$/i })
            .filter({ visible: true })
            .count(),
          0,
          "Specialist routing must be absent",
        );
        assert(
          await a.page.locator(".executive-workspace").isVisible(),
          "Default entry must select the executive workspace",
        );
        assert(
          await a.page.getByText("Beca", { exact: true }).first().isVisible(),
          "Beca must be identifiable",
        );
        assert(
          await a.page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "Horizontal overflow",
        );
        await a.page.screenshot({ path: path.join(out, `entry-${width}.png`) });
      }
      return { widths: [390, 1440], selectedSpecialist: false };
    });
    for (const name of ["software", "ice_cream", "services"]) {
      const record = { name, turns: [], modelSavedAndReopened: false };
      report.cases.push(record);
      await check(`interview-${name}`, async () => {
        if (!a?.authenticated) throw blocked("Account A login required");
        const p = a.page,
          started = Date.now();
        const pageErrors = [];
        const onError = (e) => pageErrors.push(e.name);
        p.on("pageerror", onError);
        await p.goto(a.origin + "/app?agentId=" + (config.agentId || 5), {
          waitUntil: "domcontentloaded",
        });
        await p.locator(".executive-workspace").waitFor({ timeout: 30000 });
        let previous = "",
          words = 0;
        for (const [index, turn] of cases[name].entries()) {
          const start = Date.now();
          const before = await p.getByTestId("onyx-ai-message").count();
          const sent = p.waitForResponse(
            (r) =>
              r.url().includes("/chat/send-chat-message") &&
              r.request().method() === "POST",
            { timeout: 120000 },
          );
          await p.locator("#onyx-chat-input-textbox").fill(turn.message);
          await p.locator("#onyx-chat-input-textbox").press("Enter");
          const response = await sent;
          assert.equal(
            response.status(),
            200,
            "Real native stream must succeed",
          );
          await p
            .getByTestId("onyx-ai-message")
            .nth(before)
            .waitFor({ timeout: 180000 });
          const answer = await p
            .getByTestId("onyx-ai-message")
            .nth(before)
            .innerText();
          const packets = (await response.text())
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line));
          assert(
            !packets.some((packet) => packet.error),
            "Native stream reported an error",
          );
          const failures = assess(turn, answer, previous, null, []);
          for (const earlier of record.turns.slice(0, -1)) {
            if (
              assess(turn, answer, earlier.answer, null, []).some((f) =>
                f.includes("repeated verbatim"),
              )
            ) {
              failures.push("Question repeated from an earlier turn");
              break;
            }
          }
          record.turns.push({
            input: turn.message,
            answer,
            seconds: (Date.now() - start) / 1000,
            failures,
          });
          words +=
            turn.message.split(/\s+/).length / 40 +
            answer.split(/\s+/).length / 200 +
            0.25;
          previous = answer;
          save();
          // Complete all turns so a first defect cannot hide later repetition/correction failures.
        }
        const sid = new URL(p.url()).searchParams.get("chatId");
        assert(sid, "Saved chat URL required");
        record.chatId = sid;
        const api = a.context.request;
        const transcript = (
          await json(
            await api.get(a.origin + "/api/chat/get-chat-session/" + sid),
          )
        ).messages
          .filter(
            (m) =>
              ["user", "assistant"].includes(m.message_type) &&
              m.message.trim(),
          )
          .map((m) => ({ type: m.message_type, message: m.message }));
        assert.deepEqual(
          transcript.filter((m) => m.type === "user").map((m) => m.message),
          cases[name].map((t) => t.message),
        );
        let prepared;
        const deadline = Date.now() + 120000;
        do {
          prepared = await json(
            await api.get(
              a.origin + "/api/chat/executive-brief?chat_id=" + sid,
            ),
          );
          if (prepared.saved) break;
          await delay(2000);
        } while (Date.now() < deadline);
        assert(
          prepared.saved,
          "Automatic saved brief required; no manual preparation fallback",
        );
        const finalTurn = {
          ...cases[name].at(-1),
          ...briefRules[name],
          sourced_journey_required: true,
        };
        const after = (
          await json(
            await api.get(a.origin + "/api/chat/get-chat-session/" + sid),
          )
        ).messages
          .filter(
            (m) =>
              ["user", "assistant"].includes(m.message_type) &&
              m.message.trim(),
          )
          .map((m) => ({ type: m.message_type, message: m.message }));
        record.briefFailures = assess(
          finalTurn,
          previous,
          "",
          prepared,
          transcript,
          after,
        );
        record.elapsedSeconds = (Date.now() - started) / 1000;
        record.scriptedReadAnswerMinutesProxy = words;
        record.knownRepeatedQuestionFailures = record.turns
          .flatMap((t) => t.failures)
          .filter((f) => /repeat/i.test(f)).length;
        record.unsupportedInputFailures = record.briefFailures.filter((f) =>
          /fabricat|unknown|source/i.test(f),
        ).length;
        record.pageErrors = pageErrors;
        p.off("pageerror", onError);
        record.brief = JSON.parse(
          prepared.message
            .split("<interview-brief>")[1]
            .split("</interview-brief>")[0],
        );
        record.handoff = {
          format: "burn/onyx-interview",
          version: 1,
          chatId: sid,
          messages: after,
        };
        await p.reload({ waitUntil: "domcontentloaded" });
        await p.getByTestId("onyx-ai-message").last().waitFor();
        const reloaded = await json(
          await api.get(a.origin + "/api/chat/get-chat-session/" + sid),
        );
        assert.deepEqual(
          reloaded.messages
            .filter(
              (m) =>
                ["user", "assistant"].includes(m.message_type) &&
                m.message.trim(),
            )
            .map((m) => ({ type: m.message_type, message: m.message })),
          after,
          "Reload changed saved conversation",
        );
        await p.screenshot({ path: path.join(out, `${name}-interview.png`) });
        assert.equal(pageErrors.length, 0, "Browser errors during interview");
        assert(
          words <= (config.maxScriptedMinutes || 10),
          "Interview exceeds scripted time proxy budget",
        );
        assert.equal(
          record.turns.flatMap((t) => t.failures).length +
            record.briefFailures.length,
          0,
          "Interview rubric failures",
        );
        return {
          chatId: sid,
          elapsedSeconds: record.elapsedSeconds,
          scriptedReadAnswerMinutesProxy: words,
        };
      });
      await check(`model-${name}`, async () => {
        if (!record.handoff)
          throw blocked("A persisted sourced interview is required");
        if (!config.kbOrigin) throw blocked("causl-kb origin missing");
        const context = a.context,
          kb = await context.newPage();
        try {
          await kb.goto(config.kbOrigin + "/dashboard/burn-import", {
            waitUntil: "domcontentloaded",
          });
          await kb.waitForFunction(() => Boolean(window.Clerk?.loaded), null, {
            timeout: 20000,
          });
          const org = await kb.evaluate(() => window.Clerk?.organization?.id);
          if (!org)
            throw blocked("Authenticated causl-kb organization required");
          if (config.accounts.A.expectedOrgId)
            assert.equal(org, config.accounts.A.expectedOrgId);
          record.orgId = org;
          const created = await context.request.post(
            config.kbOrigin + "/api/burn/interviews",
            {
              data: {
                requestId: randomUUID(),
                market: {
                  name: `Executive regression: ${name} ${randomUUID()}`,
                  definition: "Synthetic acceptance only; no customer data.",
                },
              },
            },
          );
          assert.equal(
            created.status(),
            201,
            "Synthetic market creation failed",
          );
          const session = await created.json();
          record.marketId = session.marketId;
          save();
          const p = a.page;
          await p.goto(
            a.origin +
              "/app?agentId=" +
              (config.agentId || 5) +
              "&chatId=" +
              record.chatId,
            { waitUntil: "domcontentloaded" },
          );
          await p.getByRole("button", { name: /^Brief(?: ·.*)?$/ }).click();
          const popup = p.waitForEvent("popup", { timeout: 20000 });
          await p
            .getByRole("button", { name: "Open business model", exact: true })
            .click({ timeout: 120000 });
          const review = await popup;
          try {
            await review.waitForURL(
              (url) =>
                url.origin === config.kbOrigin &&
                url.pathname.endsWith("/burn-import"),
            );
            await review.locator("#burn-market").selectOption(session.marketId);
            const stages = record.brief.journey.filter(
              (s) => s.status === "executive",
            );
            assert(stages.length >= 2);
            for (const s of stages)
              await review.locator(`[id="stage-${s.id}"]`).check();
            const stageIds = new Set(stages.map((s) => s.id));
            const edges = record.brief.transitions.filter(
              (e) =>
                e.behavior.status === "executive" &&
                stageIds.has(e.from) &&
                stageIds.has(e.to),
            );
            assert(edges.length);
            for (const e of edges)
              await review.locator(`[id="edge-${e.id}"]`).check();
            await review.locator("#reviewed").check();
            const proposal = review.waitForResponse(
              (r) =>
                r.url().endsWith("/api/burn/onyx-handoff") &&
                r.request().method() === "POST",
              { timeout: 120000 },
            );
            await review
              .getByRole("button", {
                name: "Prepare business model",
                exact: true,
              })
              .click();
            const document = (await json(await proposal)).document;
            assert(
              unknownModelInputs(
                document.model.graph,
                briefRules[name].unknown_inputs || [],
              ),
              "Generated model fabricated an unknown input",
            );
            const targetIds = document.model.graph.metrics
              .filter((m) => /target|goal/i.test(m.name))
              .map((m) => m.id);
            assert(
              document.model.graph.guesstimates.some(
                (c) =>
                  targetIds.includes(c.metric) &&
                  c.guesstimateType === "POINT" &&
                  Number(c.expression) === targets[name],
              ),
              "Sourced target must survive model generation",
            );
            // The actual native calculator, not the runner, enables the save control.
            const saving = review.waitForResponse(
              (r) =>
                r.url().endsWith("/api/burn/onyx-handoff") &&
                r.request().method() === "PUT",
              { timeout: 120000 },
            );
            await review
              .getByRole("button", {
                name: "Save private model and selected evidence",
                exact: true,
              })
              .click({ timeout: 90000 });
            const response = await saving;
            const saved = await json(response);
            const submitted = response.request().postDataJSON();
            assert.deepEqual(saved.accepted, {
              stages: stages.length,
              transitions: edges.length,
            });
            const stored = await json(
              await context.request.get(
                config.kbOrigin +
                  "/api/market-model?market=" +
                  encodeURIComponent(session.marketId),
              ),
            );
            assert.deepEqual(
              stored.document,
              submitted.document,
              "Saved document differs from reviewed cells",
            );
            assert(
              unknownModelInputs(
                stored.document.model.graph,
                briefRules[name].unknown_inputs || [],
              ),
              "Saved model fabricated an unknown input",
            );
            assert.equal(stored.revision, 1);
            const replay = await context.request.put(
              config.kbOrigin + "/api/burn/onyx-handoff",
              { headers: { origin: config.kbOrigin }, data: submitted },
            );
            assert.equal(
              replay.status(),
              409,
              "A replay must not overwrite a saved model",
            );
            await review
              .getByRole("link", {
                name: "Open the saved business model",
                exact: true,
              })
              .click();
            await review.reload({ waitUntil: "domcontentloaded" });
            // Support both the current embedded grid and the planned native React grid.
            const grid = async () => {
              for (const f of review.frames())
                if (await f.getByRole("gridcell").count()) return f;
              return null;
            };
            let frame;
            const until = Date.now() + 30000;
            while (!(frame = await grid()) && Date.now() < until)
              await delay(500);
            assert(frame, "Saved grid must render after reload");
            if (name === "software") {
              const computed = stored.document.model.graph.guesstimates.filter(
                (c) => c.guesstimateType === "FUNCTION",
              );
              const outcome = stored.document.model.graph.metrics.find(
                (m) =>
                  /contribution/i.test(m.name) &&
                  !/goal|target|gap|scenario/i.test(m.name) &&
                  computed.some((c) => c.metric === m.id),
              );
              assert(outcome, "Calculated baseline contribution required");
              const cells = await frame.getByRole("gridcell").allTextContents();
              assert(
                cells.some((t) =>
                  calculatedCellMatches(t, outcome.name, 10000),
                ),
                "Native calculated baseline must equal 1000 × 0.10 × 100 = 10000",
              );
              record.calculationBaseline = 10000;
            }
            record.modelSavedAndReopened = true;
            record.modelId = stored.id;
            await review.screenshot({
              path: path.join(out, `${name}-model.png`),
            });
            return {
              marketId: session.marketId,
              modelId: stored.id,
              revision: stored.revision,
            };
          } finally {
            await review.close();
          }
        } finally {
          await kb.close();
        }
      });
    }
    await check("cross-company-read-and-search-isolation", async () => {
      const b = accounts.B;
      if (!config.kbOrigin)
        throw blocked("causl-kb origin required for organization checks");
      if (!a?.authenticated || !b?.authenticated)
        throw blocked("Two authenticated native accounts required");
      assert.notEqual(a.id, b.id, "Identical accounts cannot prove isolation");
      for (const name of ["A", "B"]) {
        const account = accounts[name],
          p = await account.context.newPage();
        try {
          await p.goto(config.kbOrigin + "/dashboard", {
            waitUntil: "domcontentloaded",
          });
          await p.waitForFunction(() => Boolean(window.Clerk?.loaded), null, {
            timeout: 20000,
          });
          account.org = await p.evaluate(() => window.Clerk?.organization?.id);
          if (!account.org)
            throw blocked(
              "Both accounts require causl-kb organization sessions",
            );
          assert.equal(
            account.org,
            config.accounts[name].expectedOrgId,
            "Confirm intended synthetic organization",
          );
        } finally {
          await p.close();
        }
      }
      assert.notEqual(a.org, b.org, "Distinct companies required");
      if (!config.resources?.length)
        throw blocked(
          "Synthetic research/model/experiment/chat resource fixtures required",
        );
      const allowed = [
        ...new Set([
          a.origin,
          b.origin,
          config.kbOrigin,
          ...(config.resourceOrigins || []),
        ]),
      ];
      for (const r of config.resources) {
        assert(
          ["A", "B"].includes(r.owner) && r.synthetic === true && r.marker,
          "Explicit synthetic resource ownership required",
        );
        assert(
          allowed.includes(new URL(r.url).origin) &&
            allowed.includes(new URL(r.searchUrl).origin),
          "Resource origin must be explicit",
        );
        const owner = accounts[r.owner],
          outsider = accounts[r.owner === "A" ? "B" : "A"];
        assert(
          r.identityUrl && allowed.includes(new URL(r.identityUrl).origin),
          "Resource-service identity endpoint required",
        );
        assert.equal(
          new URL(r.identityUrl).origin,
          new URL(r.url).origin,
          "Identity must belong to the resource service",
        );
        assert.equal(
          new URL(r.searchUrl).origin,
          new URL(r.url).origin,
          "Search must use the authenticated resource service",
        );
        const ownerIdentity = await json(
          await owner.context.request.get(r.identityUrl, { maxRedirects: 0 }),
        );
        const outsiderIdentity = await json(
          await outsider.context.request.get(r.identityUrl, {
            maxRedirects: 0,
          }),
        );
        assert(
          ownerIdentity.id && outsiderIdentity.id,
          "Both resource-service sessions must be authenticated",
        );
        assert.notEqual(
          ownerIdentity.id,
          outsiderIdentity.id,
          "Distinct service identities required",
        );
        const positive = await owner.context.request.get(r.url, {
          maxRedirects: 0,
        });
        const denied = await outsider.context.request.get(r.url, {
          maxRedirects: 0,
        });
        const ownerBody = JSON.stringify(await json(positive));
        const ownerSearch = await json(
          await owner.context.request.get(r.searchUrl, { maxRedirects: 0 }),
        );
        const otherSearch = await json(
          await outsider.context.request.get(r.searchUrl, { maxRedirects: 0 }),
        );
        const passed =
          isolationResult({
            ownerStatus: positive.status(),
            ownerBody,
            outsiderStatus: denied.status(),
            marker: r.marker,
            outsiderAuthenticated: true,
          }) &&
          !(await denied.text()).includes(r.marker) &&
          JSON.stringify(ownerSearch).includes(r.marker) &&
          !JSON.stringify(otherSearch).includes(r.marker);
        report.isolation.push({
          kind: r.kind,
          owner: r.owner,
          passed,
          ownerStatus: positive.status(),
          outsiderStatus: denied.status(),
        });
        save();
      }
      assert(
        coverage(report.isolation),
        "Both directions of chats, research, models and experiments must pass",
      );
      return report.isolation;
    });
  } finally {
    await browser.close();
    report.finishedAt = new Date().toISOString();
    report.passed =
      report.checks.length === 10 &&
      report.checks.every((c) => c.status === "passed");
    // 2 identities + entry + 3 interviews + 3 models + isolation = 10 mandatory checks.
    save();
    console.log(
      JSON.stringify({
        report: path.join(out, "report.json"),
        passed: report.passed,
      }),
    );
    process.exitCode = report.passed ? 0 : 1;
  }
}
main().catch((error) => {
  console.error(error.name + ": acceptance setup failed");
  process.exitCode = 1;
});
