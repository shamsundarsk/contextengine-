import Database from 'better-sqlite3';
export declare function getDefaultDbPath(): string;
export declare function getDatabase(dbPath?: string): Database.Database;
export declare function setDatabase(db: Database.Database): void;
export declare function closeDatabase(): void;
export declare function initInMemoryDatabase(): Database.Database;
export declare function initSchema(db: Database.Database): void;
//# sourceMappingURL=db.d.ts.map