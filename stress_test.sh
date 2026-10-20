#!/bin/bash

# Configuration - Redirecting to a dedicated test DB file to isolate schemas
DB_DIR="$HOME/.config/context-engine"
DB_PATH="$DB_DIR/context_stress_test.db"
LOG_FILE="stress_test.log"
NUM_CONCURRENT_WRITES=20
LOOPS_PER_THREAD=10

echo "🚀 Initializing SQLite WAL Stress Test..."
echo "Database Target: $DB_PATH"
echo "--------------------------------------------------"

mkdir -p "$DB_DIR"
rm -f "$LOG_FILE"
rm -f "$DB_PATH" # Clear old schema definitions to prevent conflicts
touch "$LOG_FILE"

# Pre-build the exact table layout matching core attributes
sqlite3 "$DB_PATH" <<EOF
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS commits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch TEXT,
    summary TEXT,
    categorization TEXT,
    created_at TEXT
);
EOF

simulate_mcp_write() {
    local thread_id=$1
    for ((i=1; i<=LOOPS_PER_THREAD; i++)); do
        local timestamp=$(date +"%Y-%m-%d %H:%M:%S.%N")
        local fake_log="[Thread-$thread_id-Loop-$i] $timestamp | ERROR: Test execution event."
        
        # Using a structured immediate transaction with an active busy_timeout backup
        sqlite3 "$DB_PATH" <<EOF >> "$LOG_FILE" 2>&1
PRAGMA busy_timeout=10000;
BEGIN IMMEDIATE TRANSACTION;
INSERT INTO commits (branch, summary, categorization, created_at) 
VALUES ('stress-test-branch', '$fake_log', 'Transient', '$timestamp');
COMMIT;
EOF
        # Slight randomized backoff delay to allow the OS thread manager to cycle
        sleep 0.0$((RANDOM % 5 + 1))
    done
}

echo "⚡ Launching $NUM_CONCURRENT_WRITES concurrent threads..."
start_time=$(date +%s)

for ((t=1; t<=NUM_CONCURRENT_WRITES; t++)); do
    simulate_mcp_write "$t" &
done

wait
end_time=$(date +%s)
duration=$((end_time - start_time))

echo "--------------------------------------------------"
echo "✅ Stress test completed in $duration second(s)."

# Scan for explicit error reports in the execution tracker output
lock_errors=$(grep -E -i "locked|error|abort" "$LOG_FILE" | wc -l)
total_records=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM commits WHERE branch='stress-test-branch';")

echo "📊 Test Performance Breakdown:"
echo "👉 Total attempted inserts: $((NUM_CONCURRENT_WRITES * LOOPS_PER_THREAD))"
echo "👉 Total successfully stored records: $total_records"
echo "👉 SQLite Execution Failures encountered: $lock_errors"
