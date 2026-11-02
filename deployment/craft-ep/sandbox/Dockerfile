# Onyx Craft sandbox (fork main) plus Expected Parrot (EDSL, MIT) and its ep CLI.
FROM craft-ep/sandbox-base:fork-5b4b5ddae
USER root
RUN /workspace/.venv/bin/pip install --no-cache-dir "edsl==1.0.9" "boto3>=1.39.12" "openai[aiohttp]>=2.44,<3" && chown -R sandbox:sandbox /workspace/.venv
# Expected Parrot skills (expectedparrot/ep-skills), pinned; copied to /tmp at start
# so every user can read them without switching shared skills on one by one.
RUN /workspace/.venv/bin/python -c "import io,tarfile,urllib.request; tarfile.open(fileobj=io.BytesIO(urllib.request.urlopen('https://codeload.github.com/expectedparrot/ep-skills/tar.gz/f8ad7545a6d1280be518f50743c0e3e432426633').read())).extractall('/opt')" && mv /opt/ep-skills-f8ad7545a6d1280be518f50743c0e3e432426633 /opt/ep-skills && chmod -R a+rX /opt/ep-skills
# Craft starts sandboxes with /workspace/entrypoint.sh (it ignores the image ENTRYPOINT),
# so the copy into the fresh tmpfs /tmp runs as that script's first step.
RUN sed -i '2i mkdir -p /tmp/ep-skills \&\& cp -r /opt/ep-skills/plugins/edsl-research/skills/. /tmp/ep-skills/ 2>/dev/null || true' /workspace/entrypoint.sh && sed -n 1,3p /workspace/entrypoint.sh
# Expected Parrot's runway (MIT): renders the respondent view of an EDSL human survey
# locally. Own venv because it pins edsl to a git branch.
RUN python3 -m venv /opt/runway-venv && /opt/runway-venv/bin/pip install --no-cache-dir "git+https://github.com/expectedparrot/runway.git@75f6810ac889aac4d37c0750c37340e40a8d2e4f" && chmod -R a+rX /opt/runway-venv && ln -s /opt/runway-venv/bin/runway /usr/local/bin/runway
# Expected Parrot's application CLIs (expectedparrot/<repo>, pinned in ep-tools.txt), each in
# its own venv under /opt/ep-tools because several pin edsl to different git revisions.
COPY ep-tools.txt install-ep-tools.sh /tmp/ep-tools/
RUN sh /tmp/ep-tools/install-ep-tools.sh /tmp/ep-tools/ep-tools.txt && cat /opt/ep-tools/install.log
# uxtest requires Python < 3.13 (the sandbox has 3.13): give it uv's Python 3.12, plus
# Playwright's Chromium in a shared path the sandbox user can read.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN python3 -m venv /opt/uv-venv && /opt/uv-venv/bin/pip install -q --no-cache-dir uv \
 && UV_PYTHON_INSTALL_DIR=/opt/uv-python /opt/uv-venv/bin/uv python install 3.12 \
 && UV_PYTHON_INSTALL_DIR=/opt/uv-python /opt/uv-venv/bin/uv venv -q --clear -p 3.12 /opt/ep-tools/uxtest \
 && /opt/uv-venv/bin/uv pip install -q --python /opt/ep-tools/uxtest/bin/python "git+https://github.com/expectedparrot/uxtest.git@fc7d086365024585be579dc0c2bd258e9c81bda2" \
 && /opt/ep-tools/uxtest/bin/playwright install --with-deps chromium \
 && ln -sf /opt/ep-tools/uxtest/bin/uxtest /usr/local/bin/uxtest \
 && chmod -R a+rX /opt/uv-python /opt/ep-tools/uxtest /opt/ms-playwright
# Global OpenCode plugin: names each new chart with its inline Markdown and flags
# banned share wording, the same way Onyx's turn-budget plugin steers the agent.
COPY --chown=sandbox:sandbox ep-charts.ts /home/sandbox/.config/opencode/plugin/ep-charts.ts
# 50 concurrent EDSL tasks exhausted the API's Redis pool; 8 is safe.
ENV EDSL_MAX_CONCURRENT_TASKS=8
USER sandbox
