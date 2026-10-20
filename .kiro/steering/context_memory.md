---
description: Context Engine Permanent Memory & Recall Directive
globs: *
alwaysApply: true
---

# CONTEXT ENGINE — PERSISTENT MEMORY SYSTEM

You are equipped with **Context Engine**, a versioned, persistent context-memory system that REPLACES the built-in context window for project history. Every past decision, bug fix, and configuration value is stored in `context.db` and retrieved via MCP tools.

---

## RULE 1 — NEW CHAT / CONTEXT RESET (NON-NEGOTIABLE)

At the start of **every new chat session**, after a context window compaction, or whenever you lack history:

```
IMMEDIATELY call gather_context() — BEFORE doing anything else.
```

- This loads the full reconstructed memory from the context engine DB.
- Do NOT guess, assume, or say "I don't have context from previous sessions" without calling `gather_context()` first.
- The context engine is the source of truth — not your built-in context window.

---

## RULE 2 — STRUCTURED COMMIT FORMAT

Whenever you complete a task, fix a bug, confirm a design decision, or establish a configuration, call `commit()` with this exact structure:

### Topic format:
```
[Category] Short descriptive title
```

Categories:
- `[Bug Fix]` — fixed a bug
- `[Feature]` — added a new feature or component
- `[Config]` — port, env var, database path, model ID, etc.
- `[Design]` — color palette, layout, UI rule, CSS token
- `[API]` — endpoint schema, request/response shape
- `[Refactor]` — code structure change without behavior change
- `[Decision]` — architectural choice or tradeoff

### Summary:
1-3 sentences. Explain **what** was done and **why**. Be specific enough to reconstruct from scratch.

### kept_refs:
An array of verbatim code snippets, config values, or facts that MUST survive context resets. Include:
- Exact file paths when relevant
- Actual values (port numbers, colors, IDs) not descriptions
- Minimal but complete code snippets

### Example commit:
```
commit(
  topic: "[Bug Fix] Branch selection reverts on poll",
  summary: "handleSelectBranch was client-side only — 3s poll overwrote activeBranch from DB. Fixed by adding POST /api/sessions/:id/branch/switch endpoint and calling it on select.",
  kept_refs: [
    "POST /api/sessions/:id/branch/switch → branch(sessionId, name) → persists is_active=1 in DB",
    "packages/web/src/api.ts: switchBranch(sessionId, name) calls this endpoint",
    "App.tsx handleSelectBranch: await switchBranch(sessionId, branchName) before setActiveBranch"
  ]
)
```

---

## RULE 3 — WHEN TO COMMIT

**DO commit when:**
- A bug is fixed and verified
- A feature is implemented and working
- A color, font, port, URL, or config value is confirmed
- An API endpoint shape is established
- A file path or project structure is finalized
- An architectural pattern is chosen (e.g. "we use ESM not CJS")

**DO NOT commit for:**
- Answering questions
- Casual conversation
- Work in progress (commit when done, not during)
- Things that will obviously change

---

## RULE 4 — TARGETED RECALL

When the user asks about past work (e.g. "what port is the server on?", "what color was the button?"):
```
recall(query="port", scope="all")
```

Use `scope="branch"` to search only the current branch, `scope="all"` for full history.

---

## RULE 5 — BRANCHING WORKFLOW

- Use `branch(name)` before starting experimental or isolated work
- Use `merge(source, target)` when the work is complete and verified
- Use `checkout(commitId)` to roll back if an approach is abandoned

---

## CONTEXT ENGINE CLI (terminal reference)

```bash
context-engine status              # current session, branch, token savings
context-engine log                 # commit history for active branch
context-engine log -b <branch>     # commits on a specific branch
context-engine branches            # list all branches (* = active)
context-engine sessions            # list all project sessions
context-engine branch <name>       # create/switch branch
context-engine checkout <commitId> # roll back to a commit
```
