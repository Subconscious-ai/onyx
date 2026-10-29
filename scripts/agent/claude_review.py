#!/usr/bin/env python3
"""Prepare readable exact-head review evidence and verify native Read coverage.

This helper runs on the host from the immutable review-ref, never from PR code.
Only the official Action runs Claude. No model shell access is required.
"""

import argparse
import base64
from collections import Counter
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys


CHUNK_BYTES = 20000
CHUNK_LINES = 120
SOURCE_BYTES = 2_000_000
TOTAL_BYTES = 32_000_000
HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=True).encode()


def gh(endpoint, paginate=False):
    command = ["gh", "api"]
    if paginate:
        command += ["--paginate", "--slurp"]
    result = subprocess.run(
        command + [endpoint], check=True, capture_output=True, timeout=120,
    )
    require(len(result.stdout) <= TOTAL_BYTES, "GitHub response exceeds review limit")
    return json.loads(result.stdout)


def current_pr(repository, number, head, base, review_drafts=False):
    pr = gh(f"repos/{repository}/pulls/{number}")
    require(pr["state"] == "open", "PR is not open")
    require(pr["draft"] is False or review_drafts, "Draft review is not allowed")
    require(pr["head"]["repo"]["full_name"] == repository, "Fork review is unsupported")
    require(pr["head"]["sha"] == head, "PR head changed")
    require(pr["base"]["sha"] == base, "PR base changed")
    return pr


def validate_patch(file):
    patch = file.get("patch")
    name = file["filename"]
    require(isinstance(patch, str) and patch, f"Missing/binary patch: {name}")
    added = deleted = old = new = 0
    have_hunk = False
    for line in patch.split("\n"):
        match = HUNK.fullmatch(line)
        if match:
            require(old == new == 0, f"Truncated patch hunk: {name}")
            old, new = int(match[2] or 1), int(match[4] or 1)
            have_hunk = True
        elif line == "\\ No newline at end of file":
            require(have_hunk, f"Malformed patch: {name}")
        else:
            require(have_hunk and line[:1] in (" ", "+", "-"), f"Malformed patch: {name}")
            prefix = line[0]
            added += prefix == "+"
            deleted += prefix == "-"
            old -= prefix != "+"
            new -= prefix != "-"
            require(old >= 0 and new >= 0, f"Invalid patch hunk counts: {name}")
    require(have_hunk and old == new == 0, f"Truncated patch: {name}")
    require((added, deleted) == (file["additions"], file["deletions"]), f"Omitted patch changes: {name}")
    return patch


def source_text(repository, file):
    blob = gh(f"repos/{repository}/git/blobs/{file['sha']}")
    require(blob.get("encoding") == "base64", "Unsupported GitHub blob encoding")
    raw = base64.b64decode(blob["content"].replace("\n", ""), validate=True)
    require(len(raw) == blob["size"] <= SOURCE_BYTES, f"Oversized source: {file['filename']}")
    git_hash = hashlib.sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest()
    require(git_hash == file["sha"] == blob["sha"], "Changed-head blob hash mismatch")
    text = raw.decode("utf-8")
    require("\0" not in text, f"Binary source: {file['filename']}")
    return text


def numbered_lines(text):
    # Split even minified single lines. Preserve every character and its location.
    for number, line in enumerate(text.split("\n"), 1):
        for part, start in enumerate(range(0, max(1, len(line)), 400), 1):
            yield f"L{number:07d}.{part:04d} {line[start:start + 400]}\n"


def chunks(directory, kind, ordinal, name, text):
    records = []
    body = []
    size = 0
    for line in numbered_lines(text):
        if body and (size + len(line.encode()) > CHUNK_BYTES - 1000 or len(body) >= CHUNK_LINES - 3):
            records.append(write_chunk(directory, kind, ordinal, name, body, len(records) + 1))
            body, size = [], 0
        body.append(line)
        size += len(line.encode())
    records.append(write_chunk(directory, kind, ordinal, name, body, len(records) + 1))
    return records


def write_chunk(directory, kind, ordinal, name, body, part):
    identifier = f"{kind}-{ordinal:04d}-{part:04d}"
    text = f"UNTRUSTED {kind}: {json.dumps(name)}; chunk {identifier}\n" + "".join(body) + f"END {identifier}\n"
    raw = text.encode()
    require(len(raw) <= CHUNK_BYTES and len(text.splitlines()) <= CHUNK_LINES, "Chunk limit exceeded")
    filename = identifier + ".txt"
    (directory / filename).write_bytes(raw)
    return {"id": identifier, "file": filename, "sha256": digest(raw), "lines": len(text.splitlines())}


def validate_files(pr, pages):
    require(isinstance(pages, list) and all(isinstance(page, list) for page in pages), "Invalid files pagination")
    files = [file for page in pages for file in page]
    require(0 < len(files) == pr["changed_files"] < 3000, "Incomplete GitHub files list")
    names = [file["filename"] for file in files]
    require(len(names) == len(set(names)), "Duplicate GitHub file entry")
    for name in names:
        path = PurePosixPath(name)
        require(not path.is_absolute() and ".." not in path.parts and not any(ord(c) < 32 for c in name), "Unsafe file path")
    require(sum(file["additions"] for file in files) == pr["additions"], "PR addition count mismatch")
    require(sum(file["deletions"] for file in files) == pr["deletions"], "PR deletion count mismatch")
    return files


def prepare(args):
    pr = current_pr(args.repository, args.number, args.head, args.base, args.review_drafts == "true")
    files = validate_files(pr, gh(f"repos/{args.repository}/pulls/{args.number}/files?per_page=100", paginate=True))
    directory = args.context
    directory.mkdir(exist_ok=False)
    manifest = {"repository": args.repository, "number": args.number, "head_sha": args.head, "base_sha": args.base, "files": []}
    total = 0
    patches = []
    for ordinal, file in enumerate(files, 1):
        patch = validate_patch(file)
        source = "" if file["status"] == "removed" else source_text(args.repository, file)
        total += len(patch.encode()) + len(source.encode())
        require(total <= TOTAL_BYTES, "PR exceeds bounded review context; split the PR")
        patches.append(f"UNTRUSTED PATCH FILE: {json.dumps(file['filename'])}\n{patch}\nEND PATCH FILE: {json.dumps(file['filename'])}\n")
        manifest["files"].append({
            "path": file["filename"], "status": file["status"], "blob_sha": file["sha"],
            "patch_sha256": digest(patch.encode()), "source_sha256": digest(source.encode()),
            "source_chunks": [] if file["status"] == "removed" else chunks(directory, "source", ordinal, file["filename"], source),
        })
    # Packing across files preserves the full diff without a mandatory Read per file.
    manifest["patch_chunks"] = chunks(directory, "patch", 0, "all changed files", "".join(patches))
    current_pr(args.repository, args.number, args.head, args.base, args.review_drafts == "true")
    raw = encoded(manifest)
    (directory / "manifest.json").write_bytes(raw)
    patch_ids = [chunk["id"] for chunk in manifest["patch_chunks"]]
    properties = {key: {"type": "string", "const": value} for key, value in {
        "head_sha": args.head, "base_sha": args.base, "manifest_sha256": digest(raw),
    }.items()}
    properties.update({
        "patch_chunks_reviewed": {"type": "array", "items": {"type": "string", "enum": patch_ids}, "uniqueItems": True},
        "standards_complete": {"type": "boolean"}, "spec_complete": {"type": "boolean"},
        "incomplete": {"type": "boolean"},
    })
    schema = {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}
    (directory / "schema.json").write_bytes(encoded(schema))
    index = [f"HEAD {args.head}\nBASE {args.base}\nMANIFEST SHA256 {digest(raw)}\n"]
    index += ["Read every patch chunk in full. Source chunks are exact-head caller context.\n"]
    index.extend(f"  {chunk['file']} ({chunk['lines']} lines)\n" for chunk in manifest["patch_chunks"])
    for file in manifest["files"]:
        index.append(json.dumps(file["path"]) + "\n")
        for start in range(0, len(file["source_chunks"]), 4):
            index.append("  " + "; ".join(f"{chunk['file']} ({chunk['lines']} lines)" for chunk in file["source_chunks"][start:start + 4]) + "\n")
    # The index is also split, so large PR metadata cannot recreate the MCP trap.
    indexes = chunks(directory, "index", 0, "review manifest", "".join(index))
    (directory / "INDEX.txt").write_text("Read these numbered index files, then ALL listed patch files:\n" + "\n".join(c["file"] for c in indexes) + "\n")
    print(json.dumps({"files": len(files), "patch_chunks": len(patch_ids), "manifest_sha256": digest(raw)}))


def result_text(content):
    if isinstance(content, str):
        return content
    require(isinstance(content, list), "Unsupported native Read result")
    return "\n".join(block["text"] for block in content if block.get("type") == "text")


def message_blocks(turn):
    message = turn.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    return [block for block in content if isinstance(block, dict)] if isinstance(content, list) else []


def record_shape(value):
    if not isinstance(value, dict):
        return type(value).__name__
    keys = {"type", "subtype", "message", "content", "role", "name", "id", "input", "tool_use_id",
            "tool_use_result", "is_error", "file", "filePath", "numLines", "startLine", "totalLines"}
    return ",".join(sorted(keys.intersection(value)) + (["other"] if value.keys() - keys else []))


def read_diagnostics(execution, directory, required, calls, read):
    # Protocol shapes and counters survive cleanup without exposing trace values.
    counters = {key: Counter() for key in ("turn_types", "turn_shapes", "message_shapes", "tool_names",
                "tool_use_result_shapes", "result_content_types", "result_prefixes")}
    summary = {"read_calls": 0, "bound_read_calls": len(calls), "tool_results": 0, "verified_chunks": len(read),
               "absolute_read_paths": 0, "lexical_context_paths": 0, "resolved_context_paths": 0}
    for turn in execution:
        kind = turn.get("type")
        counters["turn_types"][kind if kind in {"assistant", "user", "system", "result", "stream_event"} else "other"] += 1
        for key, value in (("turn_shapes", turn), ("message_shapes", turn.get("message")),
                           ("tool_use_result_shapes", turn.get("tool_use_result"))):
            shape = record_shape(value)
            counters[key][shape if shape in counters[key] or len(counters[key]) < 4 else "other_shapes"] += 1
        for block in message_blocks(turn):
            if kind == "assistant" and block.get("type") == "tool_use":
                name = block.get("name")
                counters["tool_names"][name if name in {"Read", "Grep", "Glob"} else "other"] += 1
                if name == "Read":
                    summary["read_calls"] += 1
                    path_value = block.get("input", {}).get("file_path")
                    path = Path(path_value) if isinstance(path_value, str) else Path()
                    summary["absolute_read_paths"] += path.is_absolute()
                    summary["lexical_context_paths"] += path.parent == directory and path.name in required
                    summary["resolved_context_paths"] += path.is_absolute() and path.resolve().parent == directory and path.name in required
            if kind == "user" and block.get("type") == "tool_result":
                summary["tool_results"] += 1
                content = block.get("content")
                counters["result_content_types"][type(content).__name__] += 1
                if block.get("tool_use_id") in calls:
                    text = result_text(content) if isinstance(content, (str, list)) else ""
                    prefix = next((name for name, pattern in (
                        ("number_arrow", r"^[ \t]*\d+[ \t]*→"), ("number_pipe", r"^[ \t]*\d+[ \t]*[|│]"),
                        ("number_tab", r"^[ \t]*\d+\t"), ("json_array", r"^\s*\["),
                    ) if re.search(pattern, text)), "other")
                    counters["result_prefixes"][prefix] += 1
    return {**summary, **counters}


def native_read_path(call, directory, required):
    path = Path(call.get("file_path", ""))
    if path.is_absolute():
        # Runner directories can have aliases; bind the actual chunk.
        path = path.resolve()
    return path if path.is_absolute() and path.parent == directory and path.name in required else None


def successful_reads(execution, directory, required):
    require(isinstance(execution, list), "Unsupported official execution trace")
    calls = {}
    read = set()
    for turn in execution:
        for block in message_blocks(turn):
            if turn.get("type") == "assistant" and block.get("type") == "tool_use" and block.get("name") == "Read":
                call = block.get("input", {})
                path = native_read_path(call, directory, required)
                if path is not None:
                    require(block["id"] not in calls, "Duplicate native Read tool ID")
                    calls[block["id"]] = (path, call)
            if turn.get("type") == "user" and block.get("type") == "tool_result" and block.get("tool_use_id") in calls:
                path, call = calls[block["tool_use_id"]]
                if block.get("is_error"):
                    continue
                lines = path.read_text().splitlines()
                if call.get("offset", 1) != 1 or call.get("limit", len(lines)) < len(lines):
                    continue
                text = result_text(block.get("content"))
                # Native Read numbers every returned line. A success flag alone is
                # insufficient: truncated, omitted or substituted text must fail.
                if all(re.search(rf"^[ \t]*{i}(?:[ \t]*→|\t){re.escape(line)}$", text, re.MULTILINE) for i, line in enumerate(lines, 1)):
                    read.add(path.name)
    if read != set(required):
        print("native_read_diagnostics=" + json.dumps(read_diagnostics(execution, directory, required, calls, read), sort_keys=True), file=sys.stderr)
    require(read == set(required), "Incomplete native Read coverage: " + ", ".join(sorted(set(required) - read)))


def verify(args):
    directory = args.context.resolve()
    raw = (directory / "manifest.json").read_bytes()
    manifest = json.loads(raw)
    output = json.loads(os.environ["STRUCTURED_OUTPUT"])
    require(manifest["head_sha"] == args.head and manifest["base_sha"] == args.base, "Manifest revision mismatch")
    require(manifest["repository"] == args.repository and manifest["number"] == args.number, "Manifest PR mismatch")
    for key, value in {"head_sha": args.head, "base_sha": args.base, "manifest_sha256": digest(raw)}.items():
        require(output.get(key) == value, f"Review {key} mismatch")
    require(output.get("standards_complete") is True and output.get("spec_complete") is True and output.get("incomplete") is False, "Review reports incomplete Standards or Spec")
    required = {}
    for chunk in manifest["patch_chunks"]:
        require(digest((directory / chunk["file"]).read_bytes()) == chunk["sha256"], "Patch chunk changed")
        required[chunk["file"]] = chunk["id"]
    reviewed = output.get("patch_chunks_reviewed")
    require(isinstance(reviewed, list) and len(reviewed) == len(set(reviewed)) and set(reviewed) == set(required.values()), "Incomplete or duplicate review attestation")
    execution = json.loads(Path(os.environ["EXECUTION_FILE"]).read_text())
    successful_reads(execution, directory, required)
    results = [turn for turn in execution if turn.get("type") == "result"]
    require(len(results) == 1 and results[0].get("subtype") == "success" and results[0].get("is_error") is False, "Official execution did not succeed")
    require(results[0].get("structured_output") == output, "Action output differs from execution trace")
    current_pr(args.repository, args.number, args.head, args.base, args.review_drafts == "true")
    print(json.dumps({"head_sha": args.head, "manifest_sha256": digest(raw), "native_read_patch_chunks": len(required), "standards_complete": True, "spec_complete": True}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "verify"))
    parser.add_argument("--repository", required=True)
    parser.add_argument("--number", required=True, type=int)
    parser.add_argument("--head", required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--context", required=True, type=Path)
    parser.add_argument("--review-drafts", choices=("true", "false"), default="false")
    args = parser.parse_args()
    require(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repository), "Invalid repository")
    require(args.number > 0 and all(re.fullmatch(r"[a-f0-9]{40}", sha) for sha in (args.head, args.base)), "Invalid PR revision")
    {"prepare": prepare, "verify": verify}[args.command](args)


if __name__ == "__main__":
    main()
