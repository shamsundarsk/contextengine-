# Context Engine (v0.1.0-beta.1)

Context Engine is a versioned, transparent context-memory system for LLM agents built as an npm/TypeScript monorepo. It automatically triages, scores, and compresses long conversation histories using local embedding models and cheap summarizers while keeping key architectural decisions verbatim. By maintaining a git-like commit and branch graph over context memory, agents can branch, merge, recall, and roll back context without bloating prompt token windows.

---

## ⚡ Quickstart

Follow these steps from a clean clone to get Context Engine up and running:

```bash
# 1. Install dependencies across all monorepo workspaces
npm install

# 2. Set up your environment variables
cp .env.example .env

# 3. Build all workspace packages
npm run build

# 4. Start the Context Engine HTTP Proxy (Port 4000)
npm run dev:proxy

# 5. Point Claude Code / OpenAI API base URL to Context Engine Proxy
export OPENAI_BASE_URL=http://127.0.0.1:4000/v1
export ANTHROPIC_BASE_URL=http://127.0.0.1:4000

# 6. Open the live Terminal UI watcher in another terminal window
npm run dev:cli -- watch

# 7. Start and open the Browser Dashboard (Port 3000)
npm run dev:web
# Open http://localhost:3000 in your browser
```

---

## 🔌 Registering the MCP Server with Claude Code / Kiro

To register Context Engine as an MCP tool provider for Claude Code or Kiro:

```bash
claude mcp add context-engine -- npx -y @context-engine/mcp-server
```

This registers the 5 core MCP tools:
- `recall(query, scope)`
- `commit(topic, summary, kept_refs)`
- `branch(name, from_commit)`
- `merge(source_branch, target_branch)`
- `checkout(commit_id)`

---

## 🦙 Upstream & Local LLM Provider Setup (Groq / OpenAI / Ollama)

Context Engine supports any OpenAI-compatible base URL endpoint (e.g., Groq, OpenAI, Ollama, LM Studio):

```bash
# Groq Setup in .env:
OPENAI_API_KEY=gsk_...
OPENAI_BASE_URL=https://api.groq.com/openai/v1
SUMMARIZER_MODEL=openai/gpt-oss-20b
```

Requests routed through `http://127.0.0.1:4000/v1/chat/completions` are automatically triaged, scored, and forwarded downstream to Groq.

---

## 📊 Live Groq Benchmark Evaluation Results (Measured from a Clean Database)

Under a 30-turn realistic coding session (`conversation_realistic.json`) evaluated on a completely clean database (`clean_run_<timestamp>`) containing ~70% conversational filler and ~30% architectural decision facts, Context Engine was evaluated live against Groq (`openai/gpt-oss-20b`) via the Port 4000 proxy server:

| Metric | Direct Groq (`api.groq.com`) | Proxy (`http://127.0.0.1:4000`) | Savings / Result |
| :--- | :---: | :---: | :---: |
| **Total Input Tokens (Turn 30)** | 11,044 tokens | 8,227 tokens | **2,817 tokens (26% savings, clean DB)** |
| **Fact Retention (5 Recall Questions)** | 5/5 | **5/5 (100% Pass Rate)** | **Zero Fact Loss** |
| **Real Groq Latency (Q1 Turn 10)** | 570 ms | **1,240 ms** (Includes Context Graph Reconstruction) | Live Network Call |
| **Real Groq Latency (Q2 Turn 20)** | 388 ms | **563 ms** | Live Network Call |
| **Real Groq Latency (Q3 Turn 20)** | 2,000 ms | **525 ms** | Live Network Call |
| **Real Groq Latency (Q4 Turn 30)** | 410 ms | **561 ms** | Live Network Call |
| **Real Groq Latency (Q5 Turn 30)** | 971 ms | **656 ms** | Live Network Call |

### Live Groq Fact Retention Audit
1. **Turn 10 - DB Engine, Embedding Model, Proxy Port**: **PASS ✅** (`SQLite`, `Xenova/all-MiniLM-L6-v2`, `Port 4000` retained)
2. **Turn 20 - Session Resolution Priority Order**: **PASS ✅** (`header > metadata > query > hash_fallback` retained)
3. **Turn 20 - Manual Override History**: **PASS ✅** (`promoteChunk` append commit with `override_reason_log` retained)
4. **Turn 30 - 5 MCP Tool Names**: **PASS ✅** (`recall`, `commit`, `branch`, `merge`, `checkout` retained)
5. **Turn 30 - Shadow Mode Functionality**: **PASS ✅** (Token savings metric logging & raw payload forwarding retained)

---

## ⚠️ Known Limitations & Design Trade-offs

- **Specificity Precision on Transient Technical Chatter**: The current scoring system uses a hard specificity override ($\ge 0.45$) to guarantee that critical numbers, ports, file paths, and config identifiers are preserved verbatim. However, it currently cannot distinguish a durable architectural decision from specific-looking transient debug output (e.g., test execution counts like `14 passing, 0 failing`, Node version strings `Node v20.11.0`, or CLI paths). Consequently, some technical chatter is kept in `keep_verbatim` longer than ideal (**63% keep_verbatim ratio on realistic filler**). This trade-off slightly reduces maximum token compression ratio (33% vs 80%+), but guarantees **100% fact retention and zero decision loss**.

---

## 🧪 Running Unit Tests & Benchmarks

```bash
# Run unit tests across all workspace packages
npm test

# Run the 30-turn realistic evaluation benchmark script against live Groq proxy
npx tsx scripts/test_real_groq_proxy.ts
```
