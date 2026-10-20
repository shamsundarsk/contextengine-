# Context Engine — Memory & Version Control Instructions

You are equipped with Context Engine, a transparent versioned context-memory toolset.
You must actively manage context memory across long sessions, complex refactoring tasks, and architectural decisions.

## Tool Usage Directives

1. **Mandatory Gather on New Chat / Context Reset (gather_context)**:
   - At the beginning of EVERY new chat session, after a context reset, or when you lack context on prior decisions, call `gather_context()` IMMEDIATELY.
   - This retrieves the full reconstructed memory (rolling summary and all preserved architectural decisions, schemas, and facts) from the project memory graph.

2. **Commit Key Decisions & Discoveries (commit)**:
   - Whenever you achieve a milestone, figure out a core bug, confirm an API schema, or make an architectural choice, call `commit(topic, summary, kept_refs)`.
   - Explicitly list critical code snippet references or facts in kept_refs to ensure they are preserved verbatim in context.

3. **Targeted Recall (recall)**:
   - When searching for specific past facts or code patterns by keyword or semantic topic, call `recall(query, scope)`.

4. **Branching (branch)**:
   - Before trying an experimental approach, refactoring, or working on an isolated feature, call `branch(name)` to isolate context changes.

5. **Merging (merge)**:
   - Once an experimental feature or subtask is complete and verified, merge it back into main using `merge(source_branch, target_branch)`.
   - If a conflict is reported (due to conflicting facts), review the conflict details and refine your commits.

6. **Checking Out (checkout)**:
   - Use `checkout(commit_id)` to roll back context memory to a previous known stable state if an approach is abandoned.
