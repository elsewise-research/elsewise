import "server-only";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import { Workspace } from "@/models/Workspace";
import { Trajectory } from "@/models/Trajectory";
import { ensureTrajectoryColors } from "@/utils/trajectory";
import { StoredWorkspaceRecord, WorkspaceRepository } from "./types";

type WorkspaceRow = {
    id: string;
    data: string;
    ingestion_token: string;
    created_at: string;
    updated_at: string;
};

function rowToRecord(row: WorkspaceRow): StoredWorkspaceRecord {
    return {
        id: row.id,
        workspace: JSON.parse(row.data) as Workspace,
        ingestionToken: row.ingestion_token,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function openDatabase(): Database.Database {
    const dbPath = process.env.SQLITE_DB_PATH ?? path.join(process.cwd(), "data", "workspaces.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            ingestion_token TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_workspaces_ingestion_token ON workspaces(ingestion_token);
    `);
    return db;
}

// Cached on globalThis so Next's dev-mode module re-evaluation (fast refresh) doesn't
// open a second handle onto the same WAL-mode sqlite file. Opened lazily (on first real
// use, not at module-import time) since Next's build-time page-data collection imports
// route modules in several worker processes in parallel, and eagerly opening the file
// at import time raced those workers into SQLITE_BUSY against each other.
const globalForDb = globalThis as unknown as { __workspaceDb?: Database.Database };

function getDb(): Database.Database {
    if (!globalForDb.__workspaceDb) {
        globalForDb.__workspaceDb = openDatabase();
    }
    return globalForDb.__workspaceDb;
}

class SqliteWorkspaceRepository implements WorkspaceRepository {
    async create(workspace: Workspace): Promise<StoredWorkspaceRecord> {
        const id = randomUUID();
        const ingestionToken = randomUUID();
        const now = new Date().toISOString();
        const withColors = ensureTrajectoryColors(workspace);

        getDb().prepare(
            `INSERT INTO workspaces (id, data, ingestion_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        ).run(id, JSON.stringify(withColors), ingestionToken, now, now);

        return { id, workspace: withColors, ingestionToken, createdAt: now, updatedAt: now };
    }

    async getById(id: string): Promise<StoredWorkspaceRecord | null> {
        const row = getDb().prepare(`SELECT * FROM workspaces WHERE id = ?`).get(id) as WorkspaceRow | undefined;
        return row ? rowToRecord(row) : null;
    }

    async replace(id: string, workspace: Workspace): Promise<StoredWorkspaceRecord | null> {
        const existing = await this.getById(id);
        if (!existing) return null;

        const merged: Workspace = { ...workspace, trajectories: existing.workspace.trajectories };
        const now = new Date().toISOString();

        getDb().prepare(`UPDATE workspaces SET data = ?, updated_at = ? WHERE id = ?`).run(
            JSON.stringify(merged),
            now,
            id,
        );

        return { ...existing, workspace: merged, updatedAt: now };
    }

    async appendTrajectories(id: string, trajectories: Trajectory[]): Promise<StoredWorkspaceRecord | null> {
        const existing = await this.getById(id);
        if (!existing) return null;

        const merged = ensureTrajectoryColors({
            ...existing.workspace,
            trajectories: [...(existing.workspace.trajectories ?? []), ...trajectories],
        });
        const now = new Date().toISOString();

        const append = getDb().transaction(() => {
            getDb().prepare(`UPDATE workspaces SET data = ?, updated_at = ? WHERE id = ?`).run(
                JSON.stringify(merged),
                now,
                id,
            );
        });
        append();

        return { ...existing, workspace: merged, updatedAt: now };
    }

    async verifyIngestionToken(id: string, token: string): Promise<boolean> {
        const row = getDb()
            .prepare(`SELECT 1 FROM workspaces WHERE id = ? AND ingestion_token = ?`)
            .get(id, token);
        return row !== undefined;
    }
}

export const sqliteWorkspaceRepository: WorkspaceRepository = new SqliteWorkspaceRepository();
