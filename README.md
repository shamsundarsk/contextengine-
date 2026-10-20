# Context Engine — Production Autonomous MCP Server

Context Engine is an autonomous, local-first Model Context Protocol (MCP) server that provides version-controlled memory state management for Large Language Model (LLM) agents. Operating over native standard I/O (`stdio`), it implements a **Hybrid Control** architecture: autonomous operations by default in the background, with complete visual transparency and manual user overrides on demand.

---

## 🚀 Key Architectural Innovations

### 1. Pure Native MCP Server over `stdio` Transport (Zero-Proxy)
- Eliminates HTTP proxy layers (Port 4000) and global network route overrides (`OPENAI_BASE_URL`).
- Runs as a silent, local background sub-process spawned directly by the host AI application (Claude Desktop, Claude Code, VS Code, Cursor).

### 2. Native MCP Sampling API (`CreateMessageRequest`)
- Completely removes mandatory requirements for separate external API keys (Groq/OpenAI) or local `.env` files.
- Automatically sends sampling requests back to the host AI application to compress context blocks safely using the active host LLM brain.
- Automatically falls back to high-speed extractive summarization if sampling is declined or unsupported.

### 3. Dual-Tier Text Categorization & Auto-Pruning Engine
- Eliminates rigid mathematical score thresholds ($\ge 0.45$) that previously caused a 63% retention ratio of conversational filler text.
- Categorizes incoming logs into:
  - **`Transient Logs`**: Ephemeral terminal text dumps, compiler errors, stack traces, test runner dumps, and transient process IDs.
  - **`Architectural Decisions`**: File paths, configurations, permanent data schemas, and API contracts.
- Storage engine automatically clears or deeply compresses `Transient Logs` after **3 conversational turns**, while locking `Architectural Decisions` permanently into the database, dropping filler retention well below the original 63% threshold.

### 4. Background Automation Layer
- **Auto-Branching**: Observes session lifecycle notifications and automatically detects workspace directory changes or project shifts (e.g. backend vs frontend), cleanly spawning isolated memory branches (e.g., `auto-branch-backend`) behind the scenes without user intervention.
- **Auto-Committing**: An efficient background worker observes conversation turns and automatically triages buffered history every 5 to 10 turns, committing compressed state to SQLite in atomic transactions.

### 5. Power User Manual Overrides ("Hybrid Control")
- **`get_context_tree()`**: Outputs a highly structured, clean markdown-formatted visual text graph tree of all active branches, commits, parent-child relationships, and saved memory states straight to the chat view.
- **`override_memory_node(commit_id, new_summary)`**: Allows users to target an exact node in the SQLite history graph and forcibly overwrite its text content, surgically pruning out incorrect details or debug junk.
- Exposes full git-like tools: `gather_context`, `recall`, `commit`, `branch`, `merge`, and `checkout`.

### 6. Local-First Privacy Shield & Zero-Install Packaging
- Embedded SQLite database initializes and stores data exclusively inside a standardized, local-first system subfolder in the user's home directory: `~/.config/context-engine/context.db` (or `$XDG_CONFIG_HOME/context-engine/context.db`).
- Plug-and-play installation with a single system command.

---

## ⚡ Quickstart & Installation

### Single-Command Setup with Claude / Kiro
```bash
claude mcp add context-engine -- npx -y @context-engine/mcp-server
```

Or configure manually in your `claude_desktop_config.json` / MCP client settings:
```json
{
  "mcpServers": {
    "context-engine": {
      "command": "npx",
      "args": ["-y", "@context-engine/mcp-server"]
    }
  }
}
```

---

## 🛠️ MCP Tools Reference

| Tool | Mode | Description |
| :--- | :---: | :--- |
| `gather_context` | Automatic / Manual | Reconstructs bounded context memory and preserved architectural facts from the memory graph. |
| `get_context_tree` | Manual Override | Visualizes complete branch topology, commit history, and token compression metrics as a markdown tree. |
| `override_memory_node` | Manual Override | Targets an exact commit node in SQLite to overwrite reason log / topic and purge transient junk. |
| `observe_turn` | Autonomous Background | Feeds conversational turns to the background worker for 5-10 turn auto-commits and auto-branching. |
| `commit` | Manual | Explicitly locks a key architectural milestone, bug fix, or schema into permanent memory. |
| `recall` | Manual | Performs keyword and semantic similarity search across historical commits and facts. |
| `branch` | Manual / Auto | Switches to an existing branch or creates an isolated branch from a parent commit. |
| `merge` | Manual | Merges a feature context branch into the target branch with deterministic conflict detection. |
| `checkout` | Manual | Rolls back context memory to a previous commit ID. |

---

## 🧪 Testing & Validation

Run unit tests across all workspaces:
```bash
npm test
```

Build monorepo packages:
```bash
npm run build
```

---

## 🔒 Privacy & Architecture Guarantees
- **No external telemetry**: All state is stored locally on your machine.
- **No mandatory API keys**: Text compression leverages host MCP sampling or zero-dependency local summarization.
- **Zero port binding**: No background HTTP proxy servers or network port listeners required.
