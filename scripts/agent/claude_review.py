#!/usr/bin/env python3
"""Prepare readable exact-head review evidence and verify native Read coverage.

This helper runs on the host from the immutable review-ref, never from PR code.
Only the official Action runs Claude. No model shell access is required.
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
from collections.abc import Iterator
from pathlib import Path, PurePosixPath
from typing import Any

CHUNK_BYTES = 20000
CHUNK_LINES = 1000
TOTAL_BYTES = 32_000_000


def require(condition: object, message: str) -> None:
    if not condition:
        raise ValueError(message)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encoded(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, ensure_ascii=True).encode()


def gh(endpoint: str, paginate: bool = False) -> Any:
    command = ["gh", "api"]
    if paginate:
        command += ["--paginate", "--slurp"]
    result = subprocess.run(
        command + [endpoint],
        check=True,
        capture_output=True,
        timeout=120,
    )
    require(len(result.stdout) <= TOTAL_BYTES, "GitHub response exceeds review limit")
    return json.loads(result.stdout)


def current_pr(
    repository: str, number: int, head: str, base: str, review_drafts: bool = False
) -> dict[str, Any]:
    pr: dict[str, Any] = gh(f"repos/{repository}/pulls/{number}")
    require(pr["state"] == "open", "PR is not open")
    require(pr["draft"] is False or review_drafts, "Draft review is not allowed")
    require(pr["head"]["repo"]["full_name"] == repository, "Fork review is unsupported")
    require(pr["head"]["sha"] == head, "PR head changed")
    require(pr["base"]["sha"] == base, "PR base changed")
    return pr


def full_patch(args: argparse.Namespace, files: list[dict[str, Any]]) -> str:
    result = subprocess.run(
        [
            "gh",
            "api",
            f"repos/{args.repository}/pulls/{args.number}",
            "-H",
            "Accept: application/vnd.github.diff",
        ],
        check=True,
        capture_output=True,
        timeout=120,
    )
    require(0 < len(result.stdout) <= TOTAL_BYTES, "Oversized or empty GitHub diff")
    stats = subprocess.run(
        ["git", "apply", "--numstat", "-z"],
        input=result.stdout,
        check=True,
        capture_output=True,
        timeout=30,
    )
    rows = [row.split(b"\t", 2) for row in stats.stdout.split(b"\0") if row]
    actual = {
        name.decode(): (int(added), int(deleted)) for added, deleted, name in rows
    }
    expected = {
        file["filename"]: (file["additions"], file["deletions"]) for file in files
    }
    require(len(rows) == len(files) and actual == expected, "Incomplete GitHub diff")
    return result.stdout.decode("utf-8")


def numbered_lines(text: str) -> Iterator[str]:
    # Split even minified single lines. Preserve every character and its location.
    for number, line in enumerate(text.split("\n"), 1):
        for part, start in enumerate(range(0, max(1, len(line)), 400), 1):
            yield f"L{number:07d}.{part:04d} {line[start : start + 400]}\n"


def chunks(
    directory: Path, kind: str, ordinal: int, name: str, text: str
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    body: list[str] = []
    size = 0
    for line in numbered_lines(text):
        if body and (
            size + len(line.encode()) > CHUNK_BYTES - 1000
            or len(body) >= CHUNK_LINES - 3
        ):
            records.append(
                write_chunk(directory, kind, ordinal, name, body, len(records) + 1)
            )
            body, size = [], 0
        body.append(line)
        size += len(line.encode())
    records.append(write_chunk(directory, kind, ordinal, name, body, len(records) + 1))
    return records


def write_chunk(
    directory: Path, kind: str, ordinal: int, name: str, body: list[str], part: int
) -> dict[str, Any]:
    identifier = f"{kind}-{ordinal:04d}-{part:04d}"
    text = (
        f"UNTRUSTED {kind}: {json.dumps(name)}; chunk {identifier}\n"
        + "".join(body)
        + f"END {identifier}\n"
    )
    raw = text.encode()
    require(
        len(raw) <= CHUNK_BYTES and len(text.splitlines()) <= CHUNK_LINES,
        "Chunk limit exceeded",
    )
    filename = identifier + ".txt"
    (directory / filename).write_bytes(raw)
    return {
        "id": identifier,
        "file": filename,
        "sha256": digest(raw),
        "lines": len(text.splitlines()),
    }


def validate_files(
    pr: dict[str, Any], pages: list[list[dict[str, Any]]]
) -> list[dict[str, Any]]:
    require(
        isinstance(pages, list) and all(isinstance(page, list) for page in pages),
        "Invalid files pagination",
    )
    files = [file for page in pages for file in page]
    require(
        0 < len(files) == pr["changed_files"] < 3000, "Incomplete GitHub files list"
    )
    names = [file["filename"] for file in files]
    require(len(names) == len(set(names)), "Duplicate GitHub file entry")
    for name in names:
        path = PurePosixPath(name)
        require(
            not path.is_absolute()
            and ".." not in path.parts
            and not any(ord(c) < 32 for c in name),
            "Unsafe file path",
        )
    require(
        sum(file["additions"] for file in files) == pr["additions"],
        "PR addition count mismatch",
    )
    require(
        sum(file["deletions"] for file in files) == pr["deletions"],
        "PR deletion count mismatch",
    )
    return files


def prepare(args: argparse.Namespace) -> None:
    pr = current_pr(
        args.repository, args.number, args.head, args.base, args.review_drafts == "true"
    )
    files = validate_files(
        pr,
        gh(
            f"repos/{args.repository}/pulls/{args.number}/files?per_page=100",
            paginate=True,
        ),
    )
    directory = args.context
    directory.mkdir(exist_ok=False)
    manifest: dict[str, Any] = {
        "repository": args.repository,
        "number": args.number,
        "head_sha": args.head,
        "base_sha": args.base,
        "files": [],
    }
    patch = full_patch(args, files)
    manifest["files"] = [
        {
            key: file.get(key)
            for key in ("filename", "previous_filename", "status", "sha")
        }
        for file in files
    ]
    # Packing across files preserves the full diff without a mandatory Read per file.
    manifest["patch_chunks"] = chunks(
        directory, "patch", 0, "complete native GitHub diff", patch
    )
    current_pr(
        args.repository, args.number, args.head, args.base, args.review_drafts == "true"
    )
    manifest["patch_sha256"] = digest(patch.encode())
    raw = encoded(manifest)
    (directory / "manifest.json").write_bytes(raw)
    patch_ids = [chunk["id"] for chunk in manifest["patch_chunks"]]
    properties = {
        key: {"type": "string", "const": value}
        for key, value in {
            "head_sha": args.head,
            "base_sha": args.base,
            "manifest_sha256": digest(raw),
        }.items()
    }
    properties["patch_chunks_reviewed"] = {
        "type": "array",
        "items": {"type": "string", "enum": patch_ids},
        "uniqueItems": True,
    }
    properties.update(
        {
            key: {"type": "boolean"}
            for key in ("standards_complete", "spec_complete", "incomplete")
        }
    )
    schema = {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }
    (directory / "schema.json").write_bytes(encoded(schema))
    index = [f"HEAD {args.head}\nBASE {args.base}\nMANIFEST SHA256 {digest(raw)}\n"]
    index += [
        "Read every patch chunk in full. Use GitHub MCP for exact-head caller context.\n"
    ]
    index.extend(
        f"  {chunk['file']} ({chunk['lines']} lines)\n"
        for chunk in manifest["patch_chunks"]
    )
    # The index is also split, so large PR metadata cannot recreate the MCP trap.
    indexes = chunks(directory, "index", 0, "review manifest", "".join(index))
    (directory / "INDEX.txt").write_text(
        "Read these numbered index files, then ALL listed patch files:\n"
        + "\n".join(c["file"] for c in indexes)
        + "\n"
    )
    print(
        json.dumps(
            {
                "files": len(files),
                "patch_chunks": len(patch_ids),
                "manifest_sha256": digest(raw),
            }
        )
    )


def result_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    require(isinstance(content, list), "Unsupported native Read result")
    return "\n".join(block["text"] for block in content if block.get("type") == "text")


def message_blocks(turn: dict[str, Any]) -> list[dict[str, Any]]:
    message = turn.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    return (
        [block for block in content if isinstance(block, dict)]
        if isinstance(content, list)
        else []
    )


def native_read_path(
    call: dict[str, Any], directory: Path, required: dict[str, str]
) -> Path | None:
    path = Path(call.get("file_path", ""))
    if path.is_absolute():
        # Runner directories can have aliases; bind the actual chunk.
        path = path.resolve()
    return (
        path
        if path.is_absolute() and path.parent == directory and path.name in required
        else None
    )


def successful_reads(
    execution: list[dict[str, Any]], directory: Path, required: dict[str, str]
) -> None:
    require(isinstance(execution, list), "Unsupported official execution trace")
    calls: dict[str, tuple[Path, dict[str, Any]]] = {}
    read: set[str] = set()
    for turn in execution:
        for block in message_blocks(turn):
            if (
                turn.get("type") == "assistant"
                and block.get("type") == "tool_use"
                and block.get("name") == "Read"
            ):
                call = block.get("input", {})
                path = native_read_path(call, directory, required)
                if path is not None:
                    require(block["id"] not in calls, "Duplicate native Read tool ID")
                    calls[block["id"]] = (path, call)
            if (
                turn.get("type") == "user"
                and block.get("type") == "tool_result"
                and block.get("tool_use_id") in calls
            ):
                path, call = calls[block["tool_use_id"]]
                if block.get("is_error"):
                    continue
                lines = path.read_text().splitlines()
                if call.get("offset", 1) != 1 or call.get("limit", len(lines)) < len(
                    lines
                ):
                    continue
                text = result_text(block.get("content"))
                # Native Read numbers every returned line. A success flag alone is
                # insufficient: truncated, omitted or substituted text must fail.
                if all(
                    re.search(
                        rf"^[ \t]*{i}(?:[ \t]*→|\t){re.escape(line)}$",
                        text,
                        re.MULTILINE,
                    )
                    for i, line in enumerate(lines, 1)
                ):
                    read.add(path.name)
    require(
        read == set(required),
        "Incomplete native Read coverage: " + ", ".join(sorted(set(required) - read)),
    )


def verify(args: argparse.Namespace) -> None:
    directory = args.context.resolve()
    raw = (directory / "manifest.json").read_bytes()
    manifest = json.loads(raw)
    output = json.loads(os.environ["STRUCTURED_OUTPUT"])
    require(
        manifest["head_sha"] == args.head and manifest["base_sha"] == args.base,
        "Manifest revision mismatch",
    )
    require(
        manifest["repository"] == args.repository and manifest["number"] == args.number,
        "Manifest PR mismatch",
    )
    for key, value in {
        "head_sha": args.head,
        "base_sha": args.base,
        "manifest_sha256": digest(raw),
    }.items():
        require(output.get(key) == value, f"Review {key} mismatch")
    require(
        output.get("standards_complete") is True
        and output.get("spec_complete") is True
        and output.get("incomplete") is False,
        "Review reports incomplete Standards or Spec",
    )
    required: dict[str, str] = {}
    for chunk in manifest["patch_chunks"]:
        require(
            digest((directory / chunk["file"]).read_bytes()) == chunk["sha256"],
            "Patch chunk changed",
        )
        required[chunk["file"]] = chunk["id"]
    reviewed = output.get("patch_chunks_reviewed")
    require(
        isinstance(reviewed, list)
        and len(reviewed) == len(set(reviewed))
        and set(reviewed) == set(required.values()),
        "Incomplete or duplicate review attestation",
    )
    execution = json.loads(Path(os.environ["EXECUTION_FILE"]).read_text())
    successful_reads(execution, directory, required)
    results = [turn for turn in execution if turn.get("type") == "result"]
    require(
        len(results) == 1
        and results[0].get("subtype") == "success"
        and results[0].get("is_error") is False,
        "Official execution did not succeed",
    )
    require(
        results[0].get("structured_output") == output,
        "Action output differs from execution trace",
    )
    current_pr(
        args.repository, args.number, args.head, args.base, args.review_drafts == "true"
    )
    print(json.dumps({"native_read_patch_chunks": len(required), **output}))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "verify"))
    parser.add_argument("--repository", required=True)
    parser.add_argument("--number", required=True, type=int)
    parser.add_argument("--head", required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--context", required=True, type=Path)
    parser.add_argument("--review-drafts", choices=("true", "false"), default="false")
    args = parser.parse_args()
    require(
        re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repository),
        "Invalid repository",
    )
    require(
        args.number > 0
        and all(re.fullmatch(r"[a-f0-9]{40}", sha) for sha in (args.head, args.base)),
        "Invalid PR revision",
    )
    {"prepare": prepare, "verify": verify}[args.command](args)


if __name__ == "__main__":
    main()
