import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let dbInstance: Database.Database | null = null;

export function getDatabase(dbPath?: string): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  let targetPath = dbPath || process.env.DB_PATH;

  if (targetPath && !path.isAbsolute(targetPath) && targetPath !== ':memory:') {
    const parentDbPath = path.resolve(process.cwd(), '../context.db');
    const grandParentDbPath = path.resolve(process.cwd(), '../../context.db');
    const directDbPath = path.resolve(process.cwd(), 'context.db');

    if (fs.existsSync(parentDbPath)) {
      targetPath = parentDbPath;
    } else if (fs.existsSync(grandParentDbPath)) {
      targetPath = grandParentDbPath;
    } else if (fs.existsSync(directDbPath)) {
      targetPath = directDbPath;
    } else {
      targetPath = path.resolve(process.cwd(), targetPath);
    }
  }

  if (!targetPath) {
    const parentDbPath = path.resolve(process.cwd(), '../context.db');
    const grandParentDbPath = path.resolve(process.cwd(), '../../context.db');
    const directDbPath = path.resolve(process.cwd(), 'context.db');

    if (fs.existsSync(parentDbPath)) {
      targetPath = parentDbPath;
    } else if (fs.existsSync(grandParentDbPath)) {
      targetPath = grandParentDbPath;
    } else {
      targetPath = directDbPath;
    }
  }

  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  dbInstance = new Database(targetPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  initSchema(dbInstance);
  return dbInstance;
}

export function setDatabase(db: Database.Database): void {
  dbInstance = db;
  initSchema(dbInstance);
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS commits (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      session_id TEXT NOT NULL,
      branch TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      topic_label TEXT NOT NULL,
      reason_log TEXT NOT NULL,
      FOREIGN KEY (parent_id) REFERENCES commits(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      commit_id TEXT NOT NULL,
      content TEXT NOT NULL,
      label TEXT NOT NULL,
      source_ref TEXT,
      FOREIGN KEY (commit_id) REFERENCES commits(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS branches (
      name TEXT NOT NULL,
      session_id TEXT NOT NULL,
      head_commit_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (name, session_id),
      FOREIGN KEY (head_commit_id) REFERENCES commits(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS conflicts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      branch_a TEXT NOT NULL,
      branch_b TEXT NOT NULL,
      topic_label TEXT NOT NULL,
      description TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS summary_cache (
      hash TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_commits_session_branch ON commits(session_id, branch);
    CREATE INDEX IF NOT EXISTS idx_chunks_commit_id ON chunks(commit_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_label ON chunks(label);
    CREATE INDEX IF NOT EXISTS idx_branches_session ON branches(session_id);
    CREATE INDEX IF NOT EXISTS idx_conflicts_session ON conflicts(session_id);
  `);
}
