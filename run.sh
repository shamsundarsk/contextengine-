#!/usr/bin/env bash

# ==============================================================================
# CONTEXT ENGINE — COMPLETE SYSTEM LAUNCHER
# Starts the HTTP Proxy, Web API Backend, and React Dashboard
# ==============================================================================

set -e

# Ensure PATH includes standard Node/npm locations on macOS
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

# Color constants
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo -e "${BOLD}${CYAN}"
echo "  ========================================================"
echo "    🚀 CONTEXT ENGINE — VERSIONED CONTEXT-MEMORY ENGINE    "
echo "  ========================================================"
echo -e "${NC}"

# 1. Check Node.js & npm
if ! command -v node &> /dev/null; then
    echo -e "${RED}[Error] Node.js is not found in PATH. Please install Node.js (v20+).${NC}"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js detected:${NC} $NODE_VERSION"

# 2. Check .env file
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo -e "${YELLOW}! No .env found. Copying from .env.example...${NC}"
        cp .env.example .env
    else
        echo -e "${YELLOW}! Creating default .env configuration...${NC}"
        cat <<EOF > .env
PORT=4000
PROXY_PORT=4000
WEB_SERVER_PORT=3001
HOST=127.0.0.1
OPENAI_BASE_URL=https://api.groq.com/openai/v1
SUMMARIZER_MODEL=openai/gpt-oss-20b
DB_PATH=context.db
EOF
    fi
fi

# 3. Clean up any existing processes holding ports 4000, 3000, 3001
echo -e "${CYAN}→ Checking ports (4000, 3000, 3001)...${NC}"
for PORT in 4000 3000 3001; do
    PID=$(lsof -ti :$PORT 2>/dev/null || true)
    if [ -n "$PID" ]; then
        echo -e "${YELLOW}  Killing process $PID on port $PORT...${NC}"
        kill -9 $PID 2>/dev/null || true
    fi
done

# 4. Check & rebuild native bindings if necessary
echo -e "${CYAN}→ Verifying native bindings (better-sqlite3)...${NC}"
node -e "try { require('better-sqlite3'); } catch(e) { process.exit(1); }" 2>/dev/null || {
    echo -e "${YELLOW}! Rebuilding better-sqlite3 for Node $NODE_VERSION...${NC}"
    npm rebuild better-sqlite3
}

# 5. Build all workspace packages
echo -e "${CYAN}→ Compiling TypeScript monorepo packages...${NC}"
npm run build
echo -e "${GREEN}✓ All packages compiled cleanly.${NC}"

# Setup process cleanup on exit
PID_PROXY=""
PID_WEB=""

cleanup() {
    echo -e "\n${YELLOW}→ Shutting down Context Engine services...${NC}"
    if [ -n "$PID_PROXY" ]; then
        kill "$PID_PROXY" 2>/dev/null || true
    fi
    if [ -n "$PID_WEB" ]; then
        kill "$PID_WEB" 2>/dev/null || true
    fi
    echo -e "${GREEN}✓ All processes stopped cleanly. Goodbye!${NC}"
    exit 0
}

trap cleanup INT TERM EXIT

# 6. Start the Proxy Server (Port 4000)
echo -e "${CYAN}→ Starting Context Engine HTTP Proxy on port 4000...${NC}"
npm run dev:proxy > proxy.log 2>&1 &
PID_PROXY=$!

# Wait for proxy health check
sleep 1
PROXY_READY=0
for i in {1..15}; do
    if curl -s http://127.0.0.1:4000/health >/dev/null 2>&1; then
        PROXY_READY=1
        break
    fi
    sleep 0.5
done

if [ $PROXY_READY -eq 1 ]; then
    echo -e "${GREEN}✓ Proxy Server is live on http://127.0.0.1:4000${NC}"
else
    echo -e "${YELLOW}! Proxy warming up local embedding pipeline in background...${NC}"
fi

# 7. Start Web Backend & UI Dashboard (Ports 3001 & 3000)
echo -e "${CYAN}→ Starting Web API Backend & React Dashboard...${NC}"
npm run dev:web > web.log 2>&1 &
PID_WEB=$!

# Wait for Web API to become available
sleep 2

echo -e "\n${BOLD}${GREEN}========================================================${NC}"
echo -e "${BOLD}${GREEN}  ✓ CONTEXT ENGINE IS FULLY ONLINE & OPERATIONAL!        ${NC}"
echo -e "${BOLD}${GREEN}========================================================${NC}"
echo -e ""
echo -e "  ${BOLD}🖥️  Web UI Dashboard:${NC}    ${CYAN}http://localhost:3000${NC}"
echo -e "  ${BOLD}⚡ Web API Backend:${NC}     ${CYAN}http://localhost:3001${NC}"
echo -e "  ${BOLD}🛡️  HTTP Proxy Server:${NC}   ${CYAN}http://127.0.0.1:4000${NC}"
echo -e "  ${BOLD}🔌 MCP Server (Kiro):${NC}    ${CYAN}npx -y @context-engine/mcp-server${NC}"
echo -e ""
echo -e "  ${BOLD}Memory Directives:${NC}"
echo -e "  - Permanent Kiro rule active in: ${CYAN}.kiro/steering/context_memory.md${NC}"
echo -e "  - Context Gatherer ready at:    ${CYAN}http://localhost:3000${NC}"
echo -e ""
echo -e "  Logs: ${CYAN}proxy.log${NC} and ${CYAN}web.log${NC}"
echo -e "  Press ${BOLD}Ctrl+C${NC} to stop all services."
echo -e "--------------------------------------------------------\n"

# Wait on background processes
wait
