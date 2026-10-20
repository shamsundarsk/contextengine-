# Context Engine — Memory & Version Control Instructions (Hybrid Control)

You are equipped with Context Engine, a production-grade, local-first Model Context Protocol (MCP) memory system.
It implements "Hybrid Control": automatic operations by default in the background, with full manual override on demand.

## Hybrid Control Overview
1. **Automatic by Default**:
   - The engine automatically detects workspace directory/project shifts and spawns isolated branches (e.g., `auto-branch-backend`).
   - An asynchronous background worker records conversation history, runs dual-tier triage filtering, and auto-commits compressed state every 5-10 turns.
   - Ephemeral transient logs (compiler dumps, stack traces, test outputs) are automatically pruned after 3 turns, keeping only permanent architectural decisions.

2. **Manual Override on Demand**:
   - Power users can inspect the complete memory graph using `get_context_tree()`.
   - Power users can surgically overwrite or prune any commit node using `override_memory_node(commit_id, new_summary)`.

## Tool Usage Directives

1. **Context Initialization / Memory Restore (`gather_context`)**:
   - Call `gather_context()` on new chat sessions or context resets to retrieve the bounded context memory and preserved architectural facts.

2. **Visual Memory Inspection (`get_context_tree`)**:
   - Call `get_context_tree()` to view the formatted markdown text graph tree of all active branches, commits, and memory statistics.

3. **Surgical Memory Correction (`override_memory_node`)**:
   - If an incorrect detail or debug junk was stored in history, call `override_memory_node(commit_id, new_summary)` to overwrite it and prune out transient chunks.

4. **Explicit Architectural Milestone (`commit`)**:
   - Call `commit(topic, summary, kept_refs)` to immediately lock critical design choices, schemas, or bug fixes into the permanent database.

5. **Targeted Fact Retrieval (`recall`)**:
   - Query previous commits and facts using keyword or semantic search via `recall(query, scope)`.

6. **Branching & Version Control (`branch`, `merge`, `checkout`)**:
   - Isolate experimental refactors with `branch(name)`.
   - Merge completed branches with `merge(source_branch, target_branch)`.
   - Roll back context memory if needed with `checkout(commit_id)`.
