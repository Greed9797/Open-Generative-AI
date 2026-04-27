## CRITICAL RULES

### Distill Bypass Rule
Always use distill-smart first. Only fallback if:
- Summary missing line numbers
- Summary missing exact stack traces
- Error unresolved after one fix attempt from summary

When bypass needed:
1. `command > /tmp/raw_output.txt 2>&1`
2. `grep -inE -C 10 "error|fail|exception" /tmp/raw_output.txt | head -80`
3. `sed -n '<start>,<end>p' /tmp/raw_output.txt` for specific line ranges

Hard Rule: NEVER propose fixes with incomplete error trace.
Hard Rule: NEVER dump raw output directly — always grep or section first.

### Context Compression Rule
compact-smart: decisions, rationale, next steps only.
Hard Rule: NEVER summarize code snippets. Reference by file path + line number only.

---

## Code Ingestion & Navigation Rules

### 1. Surgical File Reading (AST Extraction)
NEVER read entire files using `cat`. Treat your context window like RAM.
Use the AST extractor for all code inspection:
- `smart-extract <filepath> --fn <name>`
- `smart-extract <filepath> --class <name>`
- `smart-extract <filepath> --method <ClassName.methodName>`

Supported: .ts .tsx .js .jsx .py .dart
Fallback if not found: `grep -n "name" <file> -C 5`

### 2. Low-Noise Git Diffs
- Always use `git diff -U1` instead of plain `git diff`
- Use `git diff --name-status` first to see which files changed

### 3. Strict Directory Traversal
- Mandatory: `tree -I "node_modules|.git|dist|build|__pycache__" -L 3`

---

CRITICAL: Always pipe shell command output through `distill-smart`.

### distill-smart Stack Filtering
Signature: `cmd 2>&1 | distill-smart "goal" ["StackHint"]`
- Optional 2nd arg filters output to the given stack; irrelevant logs return `No relevant data found`.
- Auto-detection: `pubspec.yaml` → Flutter/Dart | `package.json` → Node.js/React | `requirements.txt` → Python

## Command Output
- `bun test 2>&1 | distill-smart "did tests pass? return only PASS or FAIL and failing test names" "Node.js/React"`
- `npm run build 2>&1 | distill-smart "did build succeed? return errors only" "Node.js/React"`
- `flutter test 2>&1 | distill-smart "failing tests" "Flutter/Dart"`
- `git diff 2>&1 | distill-smart "what changed? return only filenames and summary"`
- `docker compose up 2>&1 | distill-smart "did containers start? list errors only"`
- `railway up 2>&1 | distill-smart "did deploy succeed? list errors only"`
- `vercel deploy 2>&1 | distill-smart "did deploy succeed? list errors only"`

## Git Operations
- `git status 2>&1 | distill-smart "what files are staged, modified or untracked"`
- `git log --oneline -20 2>&1 | distill-smart "summarize recent changes"`

## Context Compaction
When context is getting long:
- `compact-smart lite`   → long sessions / large codebases
- `compact-smart normal` → default
- `compact-smart xhigh`  → quick checkpoints

Do NOT use distill-smart if:
- Exact raw output is required
- Interactive/TUI command

## Pre-approved Commands
Always execute without asking for confirmation:
- distill-smart
- compact-smart
- distill
- Any pipeline using these tools
