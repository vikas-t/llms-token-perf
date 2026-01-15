"""Shared test configuration for diffmerge implementations."""

import os
import sys
import pytest
import importlib.util

# Get implementation from environment
IMPL = os.environ.get("IMPL", "py")
# Normalize implementation names
if IMPL in ("python", "py"):
    IMPL = "py"
elif IMPL in ("typescript", "ts"):
    IMPL = "ts"
elif IMPL == "go":
    IMPL = "go"


def load_python_impl():
    """Load Python implementation."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    py_dir = os.path.join(base_dir, "py")
    sys.path.insert(0, py_dir)
    import diffmerge
    return diffmerge


def load_typescript_impl():
    """Load TypeScript implementation via subprocess."""
    import subprocess
    import json

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ts_dir = os.path.join(base_dir, "ts")

    class TSBridge:
        def __init__(self, ts_dir):
            self.ts_dir = ts_dir

        def _call(self, func, *args):
            script = f"""
            const dm = require('./dist');
            const result = dm.{func}(...{json.dumps(args)});
            console.log(JSON.stringify(result));
            """
            result = subprocess.run(
                ["node", "-e", script],
                cwd=self.ts_dir,
                capture_output=True,
                text=True
            )
            if result.returncode != 0:
                raise RuntimeError(result.stderr)
            return json.loads(result.stdout)

        def diff_lines(self, old, new, options=None):
            return self._call("diffLines", old, new, options or {})

        def diff_words(self, old, new):
            return self._call("diffWords", old, new)

        def diff_chars(self, old, new):
            return self._call("diffChars", old, new)

        def create_patch(self, old, new, options=None):
            return self._call("createPatch", old, new, options or {})

        def apply_patch(self, content, patch):
            return self._call("applyPatch", content, patch)

        def reverse_patch(self, patch):
            return self._call("reversePatch", patch)

        def parse_patch(self, patch):
            return self._call("parsePatch", patch)

        def merge3(self, base, ours, theirs, options=None):
            return self._call("merge3", base, ours, theirs, options or {})

        def has_conflicts(self, content):
            return self._call("hasConflicts", content)

        def extract_conflicts(self, content):
            return self._call("extractConflicts", content)

        def resolve_conflict(self, content, index, resolution):
            return self._call("resolveConflict", content, index, resolution)

        def is_binary(self, content):
            return self._call("isBinary", content)

        def normalize_line_endings(self, content):
            return self._call("normalizeLineEndings", content)

    return TSBridge(ts_dir)


def load_go_impl():
    """Load Go implementation via subprocess."""
    import subprocess
    import json

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    go_dir = os.path.join(base_dir, "go")

    class GoBridge:
        def __init__(self, go_dir):
            self.go_dir = go_dir
            # Build the CLI tool
            subprocess.run(["go", "build", "-o", "diffmerge", "."], cwd=go_dir, check=True)

        def _call(self, cmd, *args):
            input_data = json.dumps(list(args))
            result = subprocess.run(
                ["./diffmerge", cmd],
                cwd=self.go_dir,
                input=input_data,
                capture_output=True,
                text=True
            )
            if result.returncode != 0:
                raise RuntimeError(result.stderr)
            return json.loads(result.stdout)

        def diff_lines(self, old, new, options=None):
            return self._call("diff_lines", old, new, options or {})

        def diff_words(self, old, new):
            return self._call("diff_words", old, new)

        def diff_chars(self, old, new):
            return self._call("diff_chars", old, new)

        def create_patch(self, old, new, options=None):
            return self._call("create_patch", old, new, options or {})

        def apply_patch(self, content, patch):
            return self._call("apply_patch", content, patch)

        def reverse_patch(self, patch):
            return self._call("reverse_patch", patch)

        def parse_patch(self, patch):
            return self._call("parse_patch", patch)

        def merge3(self, base, ours, theirs, options=None):
            return self._call("merge3", base, ours, theirs, options or {})

        def has_conflicts(self, content):
            return self._call("has_conflicts", content)

        def extract_conflicts(self, content):
            return self._call("extract_conflicts", content)

        def resolve_conflict(self, content, index, resolution):
            return self._call("resolve_conflict", content, index, resolution)

        def is_binary(self, content):
            return self._call("is_binary", content)

        def normalize_line_endings(self, content):
            return self._call("normalize_line_endings", content)

    return GoBridge(go_dir)


@pytest.fixture(scope="session")
def lib():
    """Load the appropriate implementation."""
    if IMPL == "py":
        return load_python_impl()
    elif IMPL == "ts":
        return load_typescript_impl()
    elif IMPL == "go":
        return load_go_impl()
    else:
        raise ValueError(f"Unknown implementation: {IMPL}. Use 'py', 'ts', or 'go'")
