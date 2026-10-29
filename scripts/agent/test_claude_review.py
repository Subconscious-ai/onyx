"""Offline behavior checks for the subscription review workflow."""

import base64
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest
import sys


ROOT = Path(__file__).resolve().parents[2]
HELPER = ROOT / "scripts/agent/claude_review.py"
HEAD = "a" * 40
BASE = "b" * 40


def blob(text):
    raw = text.encode()
    sha = hashlib.sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest()
    return {"sha": sha, "size": len(raw), "encoding": "base64", "content": base64.b64encode(raw).decode()}


def github_fixture():
    files, blobs = [], {}
    for i in range(73):
        # Reproduce the API's one-line JSON and an 82 KB single patch/line.
        lines = ["x" * 82400] if i == 0 else [f"source {i} line {n} " + "y" * 90 for n in range(50)]
        text = "\n".join(lines)
        source = blob(text)
        blobs[source["sha"]] = source
        files.append({
            "filename": f"src/changed-{i}.ts", "status": "added", "sha": source["sha"],
            "additions": len(lines), "deletions": 0,
            "patch": f"@@ -0,0 +1,{len(lines)} @@\n" + "\n".join("+" + line for line in lines),
        })
    pr = {"state": "open", "draft": False, "head": {"sha": HEAD, "repo": {"full_name": "owner/repo"}}, "base": {"sha": BASE}, "changed_files": 73, "additions": 3601, "deletions": 0}
    return {"pr": pr, "files": [files[:50], files[50:]], "blobs": blobs}


def fake_gh(directory):
    path = directory / "gh"
    path.write_text(
        f"#!{sys.executable}\nimport json,os,sys\n"
        "data=json.load(open(os.environ['GH_FIXTURE']))\nendpoint=sys.argv[-1]\n"
        "if '/git/blobs/' in endpoint: result=data['blobs'][endpoint.rsplit('/',1)[1]]\n"
        "elif '/files?' in endpoint: result=data['files']\n"
        "else: result=data['pr']\nprint(json.dumps(result))\n"
    )
    path.chmod(0o700)


def invoke(command, directory, environment=None, review_drafts=False):
    arguments = ["--review-drafts", "true"] if review_drafts else []
    return subprocess.run(
        [sys.executable, str(HELPER), command, "--repository", "owner/repo", "--number", "743", "--head", HEAD, "--base", BASE, "--context", str(directory / "context"), *arguments],
        env=environment, text=True, capture_output=True, check=False,
    )


def tab_read_trace(trace):
    trace = copy.deepcopy(trace)
    for turn in trace:
        if turn["type"] == "user":
            block = turn["message"]["content"][0]
            block["content"] = re.sub(r"^([ \t]*\d+)→", r"\1\t", block["content"], flags=re.MULTILINE)
    return trace


class PreparedReviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.directory = Path(cls.temporary.name)
        fake_gh(cls.directory)
        cls.fixture = github_fixture()
        cls.fixture_path = cls.directory / "github.json"
        cls.fixture_path.write_text(json.dumps(cls.fixture))
        cls.environment = dict(os.environ, PATH=str(cls.directory) + ":" + os.environ["PATH"], GH_FIXTURE=str(cls.fixture_path))
        result = invoke("prepare", cls.directory, cls.environment)
        if result.returncode:
            raise AssertionError(result.stderr)
        cls.context = cls.directory / "context"
        cls.manifest = json.loads((cls.context / "manifest.json").read_text())
        cls.required = cls.manifest["patch_chunks"]
        cls.output = {
            "head_sha": HEAD, "base_sha": BASE,
            "manifest_sha256": hashlib.sha256((cls.context / "manifest.json").read_bytes()).hexdigest(),
            "patch_chunks_reviewed": [c["id"] for c in cls.required],
            "standards_complete": True, "spec_complete": True, "incomplete": False,
        }
        cls.trace = []
        for i, chunk in enumerate(cls.required):
            path = cls.context / chunk["file"]
            cls.trace.extend([
                {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Read", "id": str(i), "input": {"file_path": str(path)}}]}},
                {"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": str(i), "content": "\n".join(f"{n:6}→{line}" for n, line in enumerate(path.read_text().splitlines(), 1))}]}},
            ])
        cls.trace.append({"type": "result", "subtype": "success", "is_error": False, "structured_output": cls.output})

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def verify(self, output=None, trace=None, review_drafts=False):
        execution = self.directory / "execution.json"
        execution.write_text(json.dumps(self.trace if trace is None else trace))
        environment = dict(self.environment, STRUCTURED_OUTPUT=json.dumps(self.output if output is None else output), EXECUTION_FILE=str(execution))
        return invoke("verify", self.directory, environment, review_drafts=review_drafts)

    def test_complete_patch_context_uses_fewer_reads_than_changed_files(self):
        self.assertLess(len(self.required), len(self.manifest["files"]))

    def test_large_paginated_api_becomes_complete_bounded_plaintext(self):
        self.assertEqual(len(self.manifest["files"]), 73)
        self.assertGreater(len(json.dumps(self.fixture["files"])), 491000)
        all_chunks = self.required + [c for f in self.manifest["files"] for c in f["source_chunks"]]
        for chunk in all_chunks:
            raw = (self.context / chunk["file"]).read_bytes()
            self.assertLessEqual(len(raw), 20000)
            self.assertLessEqual(len(raw.decode().splitlines()), 120)
        reconstructed = {}
        for chunk in self.required:
            for line in (self.context / chunk["file"]).read_text().splitlines()[1:-1]:
                location, value = line.split(" ", 1)
                number = int(location[1:].split(".")[0])
                reconstructed[number] = reconstructed.get(number, "") + value
        originals = [f for page in self.fixture["files"] for f in page]
        expected = "".join(f"UNTRUSTED PATCH FILE: {json.dumps(f['filename'])}\n{f['patch']}\nEND PATCH FILE: {json.dumps(f['filename'])}\n" for f in originals)
        self.assertEqual("\n".join(reconstructed.values()), expected)

    def test_native_draft_review_requires_explicit_opt_in(self):
        fixture = copy.deepcopy(self.fixture)
        fixture["pr"]["draft"] = True
        self.fixture_path.write_text(json.dumps(fixture))
        try:
            with tempfile.TemporaryDirectory() as directory:
                directory = Path(directory)
                denied = invoke("prepare", directory, self.environment)
                self.assertNotEqual(denied.returncode, 0)
                allowed = invoke("prepare", directory, self.environment, review_drafts=True)
                self.assertEqual(allowed.returncode, 0, allowed.stderr)
            self.assertNotEqual(self.verify().returncode, 0)
            allowed = self.verify(review_drafts=True)
            self.assertEqual(allowed.returncode, 0, allowed.stderr)
            self.assertTrue(json.loads(self.fixture_path.read_text())["pr"]["draft"])
        finally:
            self.fixture_path.write_text(json.dumps(self.fixture))

    def test_complete_attestation_and_actual_reads_pass(self):
        result = self.verify()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_native_read_horizontal_whitespace_before_arrow_preserves_coverage(self):
        trace = copy.deepcopy(self.trace)
        for turn in trace:
            if turn["type"] == "user":
                block = turn["message"]["content"][0]
                block["content"] = re.sub(r"^( +)(\d+)→", r"\1\2\t→", block["content"], flags=re.MULTILINE)
        result = self.verify(trace=trace)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_native_tab_numbered_read_format_preserves_complete_coverage(self):
        result = self.verify(trace=tab_read_trace(self.trace))
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_native_tab_numbered_read_tampering_fails(self):
        original = tab_read_trace(self.trace)[1]["message"]["content"][0]["content"]
        lines = original.splitlines()
        changes = {
            "changed_text": original + "tampered",
            "omitted_first_line": "\n".join(lines[1:]),
            "omitted_last_line": "\n".join(lines[:-1]),
            "wrong_line_number": re.sub(r"^([ \t]*)1\t", r"\g<1>2\t", original, count=1),
            "space_separator": re.sub(r"^([ \t]*\d+)\t", r"\1 ", original, flags=re.MULTILINE),
        }
        for name, content in changes.items():
            trace = tab_read_trace(self.trace)
            trace[1]["message"]["content"][0]["content"] = content
            with self.subTest(change=name):
                self.assertNotEqual(self.verify(trace=trace).returncode, 0)

    def test_native_tab_numbered_reads_require_the_complete_first_page(self):
        for bounds in ({"offset": 0}, {"offset": 2}, {"limit": 1}):
            trace = tab_read_trace(self.trace)
            trace[0]["message"]["content"][0]["input"].update(bounds)
            with self.subTest(bounds=bounds):
                self.assertNotEqual(self.verify(trace=trace).returncode, 0)

    def test_native_reads_through_runner_path_alias_bind_to_exact_context_files(self):
        alias = self.directory / "runner-context-alias"
        alias.symlink_to(self.context, target_is_directory=True)
        trace = copy.deepcopy(self.trace)
        for turn in trace:
            if turn["type"] == "assistant":
                call = turn["message"]["content"][0]["input"]
                call["file_path"] = str(alias / Path(call["file_path"]).name)
        result = self.verify(trace=trace)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_native_read_alias_cannot_escape_the_prepared_context(self):
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

    def test_incomplete_read_diagnostics_show_shapes_without_trace_contents(self):
        trace = copy.deepcopy(self.trace[:2] + self.trace[-1:])
        secret = "private-credential-and-file-content-do-not-print"
        trace[0]["message"]["content"][0]["input"]["private_argument"] = secret
        trace[1]["message"]["content"][0]["content"] = "     1 | " + secret
        trace[1]["tool_use_result"] = {"type": "text", "content": secret, secret: secret}
        result = self.verify(trace=trace)
        self.assertNotEqual(result.returncode, 0)
        diagnostic, = [line.removeprefix("native_read_diagnostics=") for line in result.stderr.splitlines()
                       if line.startswith("native_read_diagnostics=")]
        diagnostic = json.loads(diagnostic)
        self.assertEqual(diagnostic["turn_types"], {"assistant": 1, "user": 1, "result": 1})
        self.assertEqual(diagnostic["read_calls"], 1)
        self.assertEqual(diagnostic["bound_read_calls"], 1)
        self.assertEqual(diagnostic["tool_results"], 1)
        self.assertEqual(diagnostic["result_prefixes"], {"number_pipe": 1})
        self.assertEqual(diagnostic["tool_use_result_shapes"], {"NoneType": 2, "content,type,other": 1})
        self.assertNotIn(secret, result.stderr)
        self.assertNotIn(str(self.context), json.dumps(diagnostic))
        self.assertLess(len(json.dumps(diagnostic)), 4000)

    def test_incomplete_or_wrong_revision_attestations_fail(self):
        changes = [
            {"patch_chunks_reviewed": []},
            {"patch_chunks_reviewed": self.output["patch_chunks_reviewed"] + [self.required[0]["id"]]},
            {"head_sha": BASE}, {"base_sha": HEAD}, {"manifest_sha256": "0" * 64},
            {"standards_complete": False}, {"spec_complete": False}, {"incomplete": True},
        ]
        for change in changes:
            with self.subTest(change=list(change)):
                self.assertNotEqual(self.verify(output=dict(self.output, **change)).returncode, 0)

    def test_self_attestation_cannot_replace_native_read_coverage(self):
        for variant in ("none", "error", "offset", "limit", "truncated", "other_path", "result", "output"):
            trace = copy.deepcopy(self.trace)
            if variant == "none":
                trace = trace[-1:]
            elif variant == "error":
                trace[1]["message"]["content"][0]["is_error"] = True
            elif variant in ("offset", "limit"):
                trace[0]["message"]["content"][0]["input"][variant] = 2 if variant == "offset" else 1
            elif variant == "truncated":
                trace[1]["message"]["content"][0]["content"] = "     1→" + (self.context / self.required[0]["file"]).read_text().splitlines()[0]
            elif variant == "other_path":
                trace[0]["message"]["content"][0]["input"]["file_path"] = "/tmp/other.txt"
            elif variant == "result":
                trace[-1]["is_error"] = True
            elif variant == "output":
                trace[-1]["structured_output"]["incomplete"] = True
            with self.subTest(variant=variant):
                self.assertNotEqual(self.verify(trace=trace).returncode, 0)

    def test_changed_chunk_or_current_head_fails(self):
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

    def test_omitted_binary_malformed_and_truncated_patches_fail(self):
        for variant in ("missing", "binary", "hunk", "statistics", "omitted", "duplicate", "blob"):
            fixture = copy.deepcopy(self.fixture)
            first = fixture["files"][0][0]
            if variant == "missing":
                del first["patch"]
            elif variant == "binary":
                first["patch"] = "Binary files differ"
            elif variant == "hunk":
                first["patch"] += "\n+unexpected"
            elif variant == "statistics":
                first["additions"] += 1
                fixture["pr"]["additions"] += 1
            elif variant == "omitted":
                fixture["files"][0].pop()
            elif variant == "duplicate":
                fixture["files"][0][1] = first
            elif variant == "blob":
                fixture["blobs"][first["sha"]]["content"] = base64.b64encode(b"wrong source").decode()
            with self.subTest(variant=variant), tempfile.TemporaryDirectory() as directory:
                directory = Path(directory)
                altered = directory / "github.json"
                altered.write_text(json.dumps(fixture))
                result = invoke("prepare", directory, dict(self.environment, GH_FIXTURE=str(altered)))
                self.assertNotEqual(result.returncode, 0)


    def test_summary_marker_without_code_review_fails_workflow(self):
        workflow = (ROOT / ".github/workflows/claude-review.yml").read_text()
        gate = workflow.split("      - name: Require completed and persisted review\n")[1]
        script = gate.split("        run: |\n", 1)[1]
        script = "\n".join(line[10:] for line in script.splitlines())
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
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
                execution.write_text(json.dumps(self.trace if complete else self.trace[-1:]))
                summary = "Standards: 0; Spec: 0" if complete else "Advisory and partial: core.py and 22 files unread"
                environment = dict(
                    self.environment, PATH=str(directory) + ":" + os.environ["PATH"],
                    CONCLUSION="success", NUMBER="743", HEAD_SHA=HEAD, BASE_SHA=BASE,
                    REVIEW_DRAFTS="false", GITHUB_REPOSITORY="owner/repo",
                    REVIEW_HELPER=str(HELPER), REVIEW_CONTEXT=str(self.context),
                    STRUCTURED_OUTPUT=json.dumps(self.output), EXECUTION_FILE=str(execution),
                    REVIEW_COMMENT=f"<!-- claude-review:{HEAD} --> {summary}",
                )
                result = subprocess.run(
                    ["bash", "-c", script], env=environment,
                    text=True, capture_output=True, check=False,
                )
                with self.subTest(complete=complete):
                    if complete:
                        self.assertEqual(result.returncode, 0, result.stderr)
                        self.assertIn(f"<!-- claude-review:{HEAD} -->", result.stdout)
                    else:
                        self.assertNotEqual(result.returncode, 0, result.stdout)
                        self.assertIn("Incomplete native Read coverage", result.stderr)
                        self.assertNotIn(f"<!-- claude-review:{HEAD} -->", result.stdout)


if __name__ == "__main__":
    unittest.main()
