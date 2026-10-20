import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

let dbInstance: Database.Database | null = null;

export function getDefaultDbPath(): string {
  if (process.env.DB_PATH) {
    const p = process.env.DB_PATH;
    if (!path.isAbsolute(p) && p !== ':memory:') {
      const parentDb = path.resolve(process.cwd(), '..', p);
      const grandParentDb = path.resolve(process.cwd(), '../..', p);
      const directDb = path.resolve(process.cwd(), p);
      if (fs.existsSync(parentDb)) return parentDb;
      if (fs.existsSync(grandParentDb)) return grandParentDb;
      if (fs.existsSync(directDb)) return directDb;
    }
    return p;
  }

  const baseDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(baseDir, 'context-engine', 'context.db');
}

export function getDatabase(dbPath?: string): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  let targetPath = dbPath || process.env.DB_PATH;

  if (!targetPath) {
    targetPath = getDefaultDbPath();
  } else if (!path.isAbsolute(targetPath) && targetPath !== ':memory:') {
    const parentDb = path.resolve(process.cwd(), '..', targetPath);
    const grandParentDb = path.resolve(process.cwd(), '../..', targetPath);
    const directDb = path.resolve(process.cwd(), targetPath);

    if (fs.existsSync(parentDb)) {
      targetPath = parentDb;
    } else if (fs.existsSync(grandParentDb)) {
      targetPath = grandParentDb;
    } else if (fs.existsSync(directDb)) {
      targetPath = directDb;
    } else {
      targetPath = directDb;
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
  dbInstance.pragma('synchronous = NORMAL');

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

export function initInMemoryDatabase(): Database.Database {
  const db = new Database(':memory:');
  setDatabase(db);
  return db;
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
      turn INTEGER DEFAULT 0,
      FOREIGN KEY (parent_id) REFERENCES commits(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      commit_id TEXT NOT NULL,
      content TEXT NOT NULL,
      label TEXT NOT NULL,
      tier TEXT DEFAULT 'conversational',
      turn INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT 0,
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

  // Migrate existing tables if columns missing before creating tier index
  try {
    const chunkInfo = db.prepare('PRAGMA table_info(chunks)').all() as { name: string }[];
    const chunkCols = new Set(chunkInfo.map((c) => c.name));
    if (!chunkCols.has('tier')) {
      db.exec("ALTER TABLE chunks ADD COLUMN tier TEXT DEFAULT 'conversational'");
    }
    if (!chunkCols.has('turn')) {
      db.exec('ALTER TABLE chunks ADD COLUMN turn INTEGER DEFAULT 0');
    }
    if (!chunkCols.has('created_at')) {
      db.exec('ALTER TABLE chunks ADD COLUMN created_at INTEGER DEFAULT 0');
    }
  } catch {
    // Non-fatal
  }

  try {
    const commitInfo = db.prepare('PRAGMA table_info(commits)').all() as { name: string }[];
    const commitCols = new Set(commitInfo.map((c) => c.name));
    if (!commitCols.has('turn')) {
      db.exec('ALTER TABLE commits ADD COLUMN turn INTEGER DEFAULT 0');
    }
  } catch {
    // Non-fatal
  }

  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_chunks_tier_turn ON chunks(tier, turn)');
  } catch {
    // Non-fatal
  }
}


