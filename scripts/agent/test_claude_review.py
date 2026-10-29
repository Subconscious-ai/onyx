"""Offline behavior checks for the subscription review workflow."""

import base64
import copy
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
HELPER = ROOT / "scripts/agent/claude_review.py"
HEAD = "a" * 40
BASE = "b" * 40


def blob(text: str) -> dict[str, Any]:
    raw = text.encode()
    sha = hashlib.sha1(
        f"blob {len(raw)}\0".encode() + raw, usedforsecurity=False
    ).hexdigest()
    return {
        "sha": sha,
        "size": len(raw),
        "encoding": "base64",
        "content": base64.b64encode(raw).decode(),
    }


def github_fixture() -> dict[str, Any]:
    files, blobs = [], {}
    for i in range(73):
        # Reproduce the API's one-line JSON and an 82 KB single patch/line.
        lines = (
            ["x" * 82400]
            if i == 0
            else [f"source {i} line {n} " + "y" * 90 for n in range(50)]
        )
        text = "\n".join(lines)
        source = blob(text)
        blobs[source["sha"]] = source
        files.append(
            {
                "filename": f"src/changed-{i}.ts",
                "status": "added",
                "sha": source["sha"],
                "additions": len(lines),
                "deletions": 0,
                "patch": f"@@ -0,0 +1,{len(lines)} @@\n"
                + "\n".join("+" + line for line in lines),
            }
        )
    pr = {
        "state": "open",
        "draft": False,
        "head": {"sha": HEAD, "repo": {"full_name": "owner/repo"}},
        "base": {"sha": BASE},
        "changed_files": 73,
        "additions": 3601,
        "deletions": 0,
    }
    patch = "".join(
        f"diff --git a/{file['filename']} b/{file['filename']}\n"
        f"new file mode 100644\n--- /dev/null\n+++ b/{file['filename']}\n"
        + file["patch"]
        + "\n"
        for file in files
    )
    return {"pr": pr, "files": [files[:50], files[50:]], "blobs": blobs, "diff": patch}


def fake_gh(directory: Path) -> None:
    path = directory / "gh"
    path.write_text(
        f"#!{sys.executable}\nimport json,os,sys\n"
        "data=json.load(open(os.environ['GH_FIXTURE']))\nendpoint=sys.argv[-1]\n"
        "if 'Accept: application/vnd.github.diff' in sys.argv: print(data['diff'],end='');sys.exit(0)\n"
        "if '/git/blobs/' in endpoint: result=data['blobs'][endpoint.rsplit('/',1)[1]]\n"
        "elif '/files?' in endpoint: result=data['files']\n"
        "else: result=data['pr']\nprint(json.dumps(result))\n"
    )
    path.chmod(0o700)


def invoke(
    command: str,
    directory: Path,
    environment: dict[str, str] | None = None,
    review_drafts: bool = False,
) -> subprocess.CompletedProcess[str]:
    arguments = ["--review-drafts", "true"] if review_drafts else []
    return subprocess.run(
        [
            sys.executable,
            str(HELPER),
            command,
            "--repository",
            "owner/repo",
            "--number",
            "743",
            "--head",
            HEAD,
            "--base",
            BASE,
            "--context",
            str(directory / "context"),
            *arguments,
        ],
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )


def tab_read_trace(trace: list[dict[str, Any]]) -> list[dict[str, Any]]:
    trace = copy.deepcopy(trace)
    for turn in trace:
        if turn["type"] == "user":
            block = turn["message"]["content"][0]
            block["content"] = re.sub(
                r"^([ \t]*\d+)→", r"\1\t", block["content"], flags=re.MULTILINE
            )
    return trace


class PreparedReviewTest(unittest.TestCase):
    temporary: tempfile.TemporaryDirectory[str]
    directory: Path
    fixture: dict[str, Any]
    fixture_path: Path
    environment: dict[str, str]
    context: Path
    manifest: dict[str, Any]
    required: list[dict[str, Any]]
    output: dict[str, Any]
    trace: list[dict[str, Any]]

    @classmethod
    def setUpClass(cls) -> None:
        cls.temporary = tempfile.TemporaryDirectory()
        cls.directory = Path(cls.temporary.name)
        fake_gh(cls.directory)
        cls.fixture = github_fixture()
        cls.fixture_path = cls.directory / "github.json"
        cls.fixture_path.write_text(json.dumps(cls.fixture))
        cls.environment = dict(
            os.environ,
            PATH=str(cls.directory) + ":" + os.environ["PATH"],
            GH_FIXTURE=str(cls.fixture_path),
        )
        result = invoke("prepare", cls.directory, cls.environment)
        if result.returncode:
            raise AssertionError(result.stderr)
        cls.context = cls.directory / "context"
        cls.manifest = json.loads((cls.context / "manifest.json").read_text())
        cls.required = cls.manifest["patch_chunks"]
        cls.output = {
            "head_sha": HEAD,
            "base_sha": BASE,
            "manifest_sha256": hashlib.sha256(
                (cls.context / "manifest.json").read_bytes()
            ).hexdigest(),
            "patch_chunks_reviewed": [c["id"] for c in cls.required],
            "standards_complete": True,
            "spec_complete": True,
            "incomplete": False,
        }
        cls.trace = []
        for i, chunk in enumerate(cls.required):
            path = cls.context / chunk["file"]
            cls.trace.extend(
                [
                    {
                        "type": "assistant",
                        "message": {
                            "content": [
                                {
                                    "type": "tool_use",
                                    "name": "Read",
                                    "id": str(i),
                                    "input": {"file_path": str(path)},
                                }
                            ]
                        },
                    },
                    {
                        "type": "user",
                        "message": {
                            "content": [
                                {
                                    "type": "tool_result",
                                    "tool_use_id": str(i),
                                    "content": "\n".join(
                                        f"{n:6}→{line}"
                                        for n, line in enumerate(
                                            path.read_text().splitlines(), 1
                                        )
                                    ),
                                }
                            ]
                        },
                    },
                ]
            )
        cls.trace.append(
            {
                "type": "result",
                "subtype": "success",
                "is_error": False,
                "structured_output": cls.output,
            }
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls.temporary.cleanup()

    def verify(
        self,
        output: dict[str, Any] | None = None,
        trace: list[dict[str, Any]] | None = None,
        review_drafts: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        execution = self.directory / "execution.json"
        execution.write_text(json.dumps(self.trace if trace is None else trace))
        environment = dict(
            self.environment,
            STRUCTURED_OUTPUT=json.dumps(self.output if output is None else output),
            EXECUTION_FILE=str(execution),
        )
        return invoke(
            "verify", self.directory, environment, review_drafts=review_drafts
        )

    def test_metadata_changes_preserve_exact_git_evidence(self) -> None:
        fixture = github_fixture()
        empty = blob("")
        text = blob("print('ok')\n")
        fixture["blobs"] = {item["sha"]: item for item in (empty, text)}
        fixture["files"] = [
            [
                {
                    "filename": "empty.py",
                    "status": "added",
                    "sha": empty["sha"],
                    "additions": 0,
                    "deletions": 0,
                    "changes": 0,
                },
                {
                    "filename": "renamed.py",
                    "previous_filename": "original.py",
                    "status": "renamed",
                    "sha": text["sha"],
                    "additions": 0,
                    "deletions": 0,
                    "changes": 0,
                },
                {
                    "filename": "executable.py",
                    "status": "modified",
                    "sha": text["sha"],
                    "additions": 0,
                    "deletions": 0,
                    "changes": 0,
                },
                {
                    "filename": "changed-owner.py",
                    "previous_filename": "old-owner.py",
                    "status": "renamed",
                    "sha": text["sha"],
                    "additions": 1,
                    "deletions": 1,
                    "changes": 2,
                },
            ]
        ]
        fixture["pr"].update(changed_files=4, additions=1, deletions=1)
        fixture["diff"] = (
            "diff --git a/empty.py b/empty.py\nnew file mode 100644\nindex 0000000..e69de29\n"
            "diff --git a/original.py b/renamed.py\nsimilarity index 100%\n"
            "rename from original.py\nrename to renamed.py\n"
            "diff --git a/executable.py b/executable.py\nold mode 100644\nnew mode 100755\n"
            "diff --git a/old-owner.py b/changed-owner.py\nold mode 100644\nnew mode 100755\n"
            "similarity index 50%\nrename from old-owner.py\nrename to changed-owner.py\n"
            "index 78b5066..2a3f5d2\n--- a/old-owner.py\n+++ b/changed-owner.py\n"
            "@@ -1,2 +1,2 @@\n unchanged\n-old\n+new\n"
        )
        with tempfile.TemporaryDirectory() as raw_directory:
            directory = Path(raw_directory)
            path = directory / "github.json"
            path.write_text(json.dumps(fixture))
            result = invoke(
                "prepare", directory, dict(self.environment, GH_FIXTURE=str(path))
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            manifest = json.loads((directory / "context/manifest.json").read_text())
            self.assertEqual(
                [file["status"] for file in manifest["files"]],
                ["added", "renamed", "modified", "renamed"],
            )
            patch = "".join(
                (directory / "context" / chunk["file"]).read_text()
                for chunk in manifest["patch_chunks"]
            )
            self.assertIn("rename from original.py", patch)
            self.assertIn("new mode 100755", patch)
            self.assertIn("old mode 100644", patch)
            self.assertIn("rename from old-owner.py", patch)
            self.assertIn("-old", patch)
            self.assertIn("+new", patch)
            # A zero-count claim must not hide omitted text changes.
            fixture["diff"] = fixture["diff"].replace(
                "rename to renamed.py", "rename to wrong.py"
            )
            path.write_text(json.dumps(fixture))
            with tempfile.TemporaryDirectory() as rejected:
                result = invoke(
                    "prepare",
                    Path(rejected),
                    dict(self.environment, GH_FIXTURE=str(path)),
                )
            self.assertNotEqual(result.returncode, 0)

    def test_text_patch_preserves_rename_and_mode_headers(self) -> None:
        fixture = github_fixture()
        file = fixture["files"][0][0]
        file.update(status="renamed", previous_filename="old-owner.ts")
        fixture["files"] = [[file]]
        fixture["pr"].update(changed_files=1, additions=1, deletions=0)
        fixture["diff"] = (
            "diff --git a/old-owner.ts b/src/changed-0.ts\n"
            "old mode 100644\nnew mode 100755\nsimilarity index 99%\n"
            "rename from old-owner.ts\nrename to src/changed-0.ts\n"
            "--- a/old-owner.ts\n+++ b/src/changed-0.ts\n" + file["patch"] + "\n"
        )
        with tempfile.TemporaryDirectory() as raw_directory:
            directory = Path(raw_directory)
            path = directory / "github.json"
            path.write_text(json.dumps(fixture))
            result = invoke(
                "prepare", directory, dict(self.environment, GH_FIXTURE=str(path))
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            manifest = json.loads((directory / "context/manifest.json").read_text())
            evidence = "".join(
                (directory / "context" / chunk["file"]).read_text()
                for chunk in manifest["patch_chunks"]
            )
            self.assertIn("rename from old-owner.ts", evidence)
            self.assertIn("new mode 100755", evidence)

    def test_short_lines_pack_into_the_existing_native_read_byte_bound(self) -> None:
        fixture = github_fixture()
        lines = [f"line {i}" for i in range(1293)]
        text = "\n".join(lines)
        source = blob(text)
        fixture["files"] = [
            [
                {
                    "filename": "review.py",
                    "status": "added",
                    "sha": source["sha"],
                    "additions": len(lines),
                    "deletions": 0,
                    "patch": f"@@ -0,0 +1,{len(lines)} @@\n"
                    + "\n".join("+" + line for line in lines),
                }
            ]
        ]
        fixture["blobs"] = {source["sha"]: source}
        fixture["diff"] = (
            "diff --git a/review.py b/review.py\nnew file mode 100644\n"
            "--- /dev/null\n+++ b/review.py\n" + fixture["files"][0][0]["patch"] + "\n"
        )
        fixture["pr"].update(changed_files=1, additions=len(lines), deletions=0)
        with tempfile.TemporaryDirectory() as raw_directory:
            directory = Path(raw_directory)
            path = directory / "github.json"
            path.write_text(json.dumps(fixture))
            result = invoke(
                "prepare", directory, dict(self.environment, GH_FIXTURE=str(path))
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            manifest = json.loads((directory / "context/manifest.json").read_text())
            self.assertLessEqual(len(manifest["patch_chunks"]), 3)
            for chunk in manifest["patch_chunks"]:
                self.assertLessEqual(
                    (directory / "context" / chunk["file"]).stat().st_size, 20000
                )

    def test_complete_patch_context_uses_fewer_reads_than_changed_files(self) -> None:
        self.assertLess(len(self.required), len(self.manifest["files"]))

    def test_large_paginated_api_becomes_complete_bounded_plaintext(self) -> None:
        self.assertEqual(len(self.manifest["files"]), 73)
        self.assertGreater(len(json.dumps(self.fixture["files"])), 491000)
        all_chunks = self.required
        for chunk in all_chunks:
            raw = (self.context / chunk["file"]).read_bytes()
            self.assertLessEqual(len(raw), 20000)
            self.assertLessEqual(len(raw.decode().splitlines()), 1000)
        reconstructed: dict[int, str] = {}
        for chunk in self.required:
            for line in (self.context / chunk["file"]).read_text().splitlines()[1:-1]:
                location, value = line.split(" ", 1)
                number = int(location[1:].split(".")[0])
                reconstructed[number] = reconstructed.get(number, "") + value
        self.assertEqual("\n".join(reconstructed.values()), self.fixture["diff"])

    def test_native_draft_review_requires_explicit_opt_in(self) -> None:
        fixture = copy.deepcopy(self.fixture)
        fixture["pr"]["draft"] = True
        self.fixture_path.write_text(json.dumps(fixture))
        try:
            with tempfile.TemporaryDirectory() as raw_directory:
                directory = Path(raw_directory)
                denied = invoke("prepare", directory, self.environment)
                self.assertNotEqual(denied.returncode, 0)
                allowed = invoke(
                    "prepare", directory, self.environment, review_drafts=True
                )
                self.assertEqual(allowed.returncode, 0, allowed.stderr)
            self.assertNotEqual(self.verify().returncode, 0)
            allowed = self.verify(review_drafts=True)
            self.assertEqual(allowed.returncode, 0, allowed.stderr)
            self.assertTrue(json.loads(self.fixture_path.read_text())["pr"]["draft"])
        finally:
            self.fixture_path.write_text(json.dumps(self.fixture))

    def test_complete_attestation_and_actual_reads_pass(self) -> None:
        result = self.verify()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_native_read_horizontal_whitespace_before_arrow_preserves_coverage(
        self,
    ) -> None:
        trace = copy.deepcopy(self.trace)
        for turn in trace:
            if turn["type"] == "user":
                block = turn["message"]["content"][0]
                block["content"] = re.sub(
                    r"^( +)(\d+)→", r"\1\2\t→", block["content"], flags=re.MULTILINE
                )
        result = self.verify(trace=trace)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_native_tab_numbered_read_format_preserves_complete_coverage(self) -> None:
        result = self.verify(trace=tab_read_trace(self.trace))
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_native_tab_numbered_read_tampering_fails(self) -> None:
        original = tab_read_trace(self.trace)[1]["message"]["content"][0]["content"]
        lines = original.splitlines()
        changes = {
            "changed_text": original + "tampered",
            "omitted_first_line": "\n".join(lines[1:]),
            "omitted_last_line": "\n".join(lines[:-1]),
            "wrong_line_number": re.sub(
                r"^([ \t]*)1\t", r"\g<1>2\t", original, count=1
            ),
            "space_separator": re.sub(
                r"^([ \t]*\d+)\t", r"\1 ", original, flags=re.MULTILINE
            ),
        }
        for name, content in changes.items():
            trace = tab_read_trace(self.trace)
            trace[1]["message"]["content"][0]["content"] = content
            with self.subTest(change=name):
                self.assertNotEqual(self.verify(trace=trace).returncode, 0)

    def test_native_tab_numbered_reads_require_the_complete_first_page(self) -> None:
        for bounds in ({"offset": 0}, {"offset": 2}, {"limit": 1}):
            trace = tab_read_trace(self.trace)
            trace[0]["message"]["content"][0]["input"].update(bounds)
            with self.subTest(bounds=bounds):
                self.assertNotEqual(self.verify(trace=trace).returncode, 0)

    def test_native_reads_through_runner_path_alias_bind_to_exact_context_files(
        self,
    ) -> None:
        alias = self.directory / "runner-context-alias"
        alias.symlink_to(self.context, target_is_directory=True)
        trace = copy.deepcopy(self.trace)
        for turn in trace:
            if turn["type"] == "assistant":
                call = turn["message"]["content"][0]["input"]
                call["file_path"] = str(alias / Path(call["file_path"]).name)
        result = self.verify(trace=trace)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_native_read_alias_cannot_escape_the_prepared_context(self) -> None:
        path = self.context / self.required[0]["file"]
        original = path.read_bytes()
        outside = self.directory / path.name
        outside.write_bytes(original)
        path.unlink()
        path.symlink_to(outside)
        try:
            self.assertNotEqual(self.verify().returncode, 0)
        finally:
            path.unlink()
            path.write_bytes(original)

    def test_incomplete_reads_do_not_expose_trace_contents(self) -> None:
        trace = copy.deepcopy(self.trace[:2] + self.trace[-1:])
        secret = "private-credential-and-file-content-do-not-print"
        trace[0]["message"]["content"][0]["input"]["private_argument"] = secret
        trace[1]["message"]["content"][0]["content"] = "     1 | " + secret
        result = self.verify(trace=trace)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Incomplete native Read coverage", result.stderr)
        self.assertNotIn(secret, result.stderr)

    def test_incomplete_or_wrong_revision_attestations_fail(self) -> None:
        changes = [
            {"patch_chunks_reviewed": []},
            {
                "patch_chunks_reviewed": self.output["patch_chunks_reviewed"]
                + [self.required[0]["id"]]
            },
            {"head_sha": BASE},
            {"base_sha": HEAD},
            {"manifest_sha256": "0" * 64},
            {"standards_complete": False},
            {"spec_complete": False},
            {"incomplete": True},
        ]
        for change in changes:
            with self.subTest(change=list(change)):
                self.assertNotEqual(
                    self.verify(output=dict(self.output, **change)).returncode, 0
                )

    def test_self_attestation_cannot_replace_native_read_coverage(self) -> None:
        for variant in (
            "none",
            "error",
            "offset",
            "limit",
            "truncated",
            "other_path",
            "result",
            "output",
        ):
            trace = copy.deepcopy(self.trace)
            if variant == "none":
                trace = trace[-1:]
            elif variant == "error":
                trace[1]["message"]["content"][0]["is_error"] = True
            elif variant in ("offset", "limit"):
                trace[0]["message"]["content"][0]["input"][variant] = (
                    2 if variant == "offset" else 1
                )
            elif variant == "truncated":
                trace[1]["message"]["content"][0]["content"] = (
                    "     1→"
                    + (self.context / self.required[0]["file"])
                    .read_text()
                    .splitlines()[0]
                )
            elif variant == "other_path":
                trace[0]["message"]["content"][0]["input"]["file_path"] = str(
                    self.directory / "other.txt"
                )
            elif variant == "result":
                trace[-1]["is_error"] = True
            elif variant == "output":
                trace[-1]["structured_output"]["incomplete"] = True
            with self.subTest(variant=variant):
                self.assertNotEqual(self.verify(trace=trace).returncode, 0)

    def test_changed_chunk_or_current_head_fails(self) -> None:
        path = self.context / self.required[0]["file"]
        original = path.read_bytes()
        try:
            path.write_bytes(original + b"changed\n")
            self.assertNotEqual(self.verify().returncode, 0)
        finally:
            path.write_bytes(original)
        for revision in ("head", "base"):
            fixture = copy.deepcopy(self.fixture)
            fixture["pr"][revision]["sha"] = "c" * 40
            self.fixture_path.write_text(json.dumps(fixture))
            try:
                with self.subTest(revision=revision):
                    result = self.verify()
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn(f"PR {revision} changed", result.stderr)
            finally:
                self.fixture_path.write_text(json.dumps(self.fixture))

    def test_omitted_binary_malformed_and_truncated_patches_fail(self) -> None:
        for variant in (
            "missing",
            "binary",
            "hunk",
            "statistics",
            "omitted",
            "duplicate",
        ):
            fixture = copy.deepcopy(self.fixture)
            first = fixture["files"][0][0]
            if variant == "missing":
                fixture["diff"] = fixture["diff"].split(
                    "diff --git a/src/changed-1.ts", 1
                )[0]
            elif variant == "binary":
                fixture["diff"] = "Binary files differ\n"
            elif variant == "hunk":
                fixture["diff"] = fixture["diff"].replace(
                    "@@ -0,0 +1,1 @@", "@@ -0,0 +1,2 @@", 1
                )
            elif variant == "statistics":
                first["additions"] += 1
                fixture["pr"]["additions"] += 1
            elif variant == "omitted":
                fixture["files"][0].pop()
            elif variant == "duplicate":
                fixture["files"][0][1] = first
            with (
                self.subTest(variant=variant),
                tempfile.TemporaryDirectory() as raw_directory,
            ):
                directory = Path(raw_directory)
                altered = directory / "github.json"
                altered.write_text(json.dumps(fixture))
                result = invoke(
                    "prepare",
                    directory,
                    dict(self.environment, GH_FIXTURE=str(altered)),
                )
                self.assertNotEqual(result.returncode, 0)

    def test_summary_marker_without_code_review_fails_workflow(self) -> None:
        workflow = (ROOT / ".github/workflows/pr-review.yml").read_text()
        gate = workflow.split("      - name: Require completed and persisted review\n")[
            1
        ]
        script = gate.split("        run: |\n", 1)[1]
        script = "\n".join(line[10:] for line in script.splitlines())
        with tempfile.TemporaryDirectory() as raw_directory:
            directory = Path(raw_directory)
            gh = directory / "gh"
            gh.write_text(
                f"#!{sys.executable}\nimport json,os,sys\n"
                f"if sys.argv[1] == 'pr': print('{HEAD}')\n"
                "elif any('/comments' in arg for arg in sys.argv): print(os.environ['REVIEW_COMMENT'])\n"
                "else: print(json.dumps(json.load(open(os.environ['GH_FIXTURE']))['pr']))\n"
            )
            gh.chmod(0o700)
            execution = directory / "execution.json"
            for complete in (False, True):
                execution.write_text(
                    json.dumps(self.trace if complete else self.trace[-1:])
                )
                summary = (
                    "Standards: 0; Spec: 0"
                    if complete
                    else "Advisory and partial: core.py and 22 files unread"
                )
                environment = dict(
                    self.environment,
                    PATH=str(directory) + ":" + os.environ["PATH"],
                    CONCLUSION="success",
                    NUMBER="743",
                    HEAD_SHA=HEAD,
                    BASE_SHA=BASE,
                    REVIEW_DRAFTS="false",
                    GITHUB_REPOSITORY="owner/repo",
                    REVIEW_HELPER=str(HELPER),
                    REVIEW_CONTEXT=str(self.context),
                    STRUCTURED_OUTPUT=json.dumps(self.output),
                    EXECUTION_FILE=str(execution),
                    REVIEW_COMMENT=f"<!-- claude-review:{HEAD} --> {summary}",
                )
                result = subprocess.run(
                    ["bash", "-c", script],
                    env=environment,
                    text=True,
                    capture_output=True,
                    check=False,
                )
                with self.subTest(complete=complete):
                    if complete:
                        self.assertEqual(result.returncode, 0, result.stderr)
                        self.assertIn(f"<!-- claude-review:{HEAD} -->", result.stdout)
                    else:
                        self.assertNotEqual(result.returncode, 0, result.stdout)
                        self.assertIn("Incomplete native Read coverage", result.stderr)
                        self.assertNotIn(
                            f"<!-- claude-review:{HEAD} -->", result.stdout
                        )


if __name__ == "__main__":
    unittest.main()
