#!/usr/bin/env python3
"""
Post (or update) a PR comment containing the `make perf` output.

Usage:
    python3 post_pr_comment.py <output_file>

The script reads the perf output from the given file, wraps it in a Markdown
comment, and either creates a new PR comment or updates an existing one
(identified by a hidden HTML marker) so that repeated pushes don't accumulate
duplicate comments.

Environment variables (provided automatically by GitHub Actions):
    GITHUB_TOKEN      – used by the `gh` CLI for authentication
    GITHUB_REPOSITORY – owner/repo
    GITHUB_EVENT_PATH – path to the event JSON (used to find the PR number)
    GITHUB_SERVER_URL – e.g. https://github.com
    GITHUB_RUN_ID     – the workflow run id (for the "full run" link)
"""

import json
import os
import subprocess
import sys

MARKER = "<!-- perf-benchmark-comment -->"
MAX_CHARS = 60000


def run(cmd, **kwargs):
    return subprocess.run(cmd, check=True, **kwargs)


def run_capture(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def get_pr_number():
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path:
        return None
    with open(event_path) as f:
        event = json.load(f)
    return event.get("pull_request", {}).get("number")


def find_existing_comment(repo, pr_number):
    """Return the comment id of the most recent perf comment, or None."""
    result = run_capture([
        "gh", "api",
        f"repos/{repo}/issues/{pr_number}/comments",
        "--paginate",
        "--jq", '.[] | select(.body | contains("perf-benchmark-comment")) | .id',
    ])
    ids = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return int(ids[-1]) if ids else None


def build_body(output, repo, run_id):
    truncated = False
    if len(output) > MAX_CHARS:
        output = output[:MAX_CHARS]
        truncated = True

    server_url = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    run_link = f"{server_url}/{repo}/actions/runs/{run_id}" if run_id else ""

    truncation_note = "⚠️ Output was truncated due to length." if truncated else ""

    # The command is passed in rather than hardcoded so this label cannot drift
    # away from what the workflow actually ran.
    command_label = os.environ.get("PERF_COMMAND", "make perf")

    # Built without textwrap.dedent: dedent would run after substitution, and
    # `output` contains column-0 lines, so the common prefix would be empty and
    # the template's own indentation would survive. An indented "##" is a code
    # block in Markdown, not a heading.
    body = "\n".join(
        [
            MARKER,
            "## 📊 Performance Benchmark Results",
            "",
            "<details>",
            f"<summary><code>{command_label}</code> output</summary>",
            "",
            "```",
            output,
            "```",
            "",
            "</details>",
            "",
            truncation_note,
            "",
            f"[Full run]({run_link})",
            "",
        ]
    )
    return body


def main():
    if len(sys.argv) < 2:
        print("Usage: post_pr_comment.py <output_file>", file=sys.stderr)
        sys.exit(1)

    output_file = sys.argv[1]
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    run_id = os.environ.get("GITHUB_RUN_ID", "")

    pr_number = get_pr_number()
    if not pr_number:
        print("Could not determine PR number; skipping comment.")
        return

    with open(output_file) as f:
        output = f.read()

    body = build_body(output, repo, run_id)

    # Write body to a temp file to avoid shell-escaping issues
    body_file = "perf_comment_body.md"
    with open(body_file, "w") as f:
        f.write(body)

    existing_id = find_existing_comment(repo, pr_number)

    if existing_id:
        run([
            "gh", "api",
            f"repos/{repo}/issues/comments/{existing_id}",
            "-X", "PATCH",
            "-F", f"body=@{body_file}",
        ])
        print(f"Updated existing perf comment {existing_id}")
    else:
        run([
            "gh", "pr", "comment", str(pr_number),
            "--body-file", body_file,
        ])
        print("Created new perf comment")


if __name__ == "__main__":
    main()
