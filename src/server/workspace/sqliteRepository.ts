import "server-only";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import { Workspace } from "@/models/Workspace";
import { Trajectory } from "@/models/Trajectory";
import { ValueClustering } from "@/models/ValueClustering";
import { Batch, BatchData } from "@/models/Batch";
import { ensureTrajectoryColors } from "@/utils/trajectory";
import { StoredWorkspaceRecord, WorkspaceRepository } from "./types";

type WorkspaceRow = {
    id: string;
    data: string;
    ingestion_token: string;
    created_at: string;
    updated_at: string;
};

function batchRowToBatch(row: { id: string; created_at: string }): Batch {
    return { id: row.id, createdAt: row.created_at };
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

        CREATE TABLE IF NOT EXISTS batches (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_batches_workspace_id ON batches(workspace_id);
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
    // Workspace rows created before batches existed still have `trajectories`/
    // `valueClusterings` embedded directly in their JSON blob. The first time such a row
    // is read, split that data out into its own batch row and strip it from the workspace
    // row — a one-time, lazy migration (this codebase has no separate migration mechanism).
    // Returns the parsed (and, if needed, migrated) metadata directly, so callers don't
    // have to re-parse the same JSON a second time.
    private migrateLegacyShapeIfNeeded(row: WorkspaceRow): Workspace {
        const parsed = JSON.parse(row.data) as Workspace & {
            trajectories?: Trajectory[];
            valueClusterings?: ValueClustering[];
        };
        if (parsed.trajectories === undefined) return parsed;

        const { trajectories, valueClusterings, ...metadata } = parsed;
        const batchId = randomUUID();
        const data: BatchData = { trajectories: trajectories ?? [], valueClusterings: valueClusterings ?? [] };

        getDb().transaction(() => {
            getDb().prepare(
                `INSERT INTO batches (id, workspace_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
            ).run(batchId, row.id, JSON.stringify(data), row.created_at, row.created_at);
            getDb().prepare(`UPDATE workspaces SET data = ? WHERE id = ?`).run(JSON.stringify(metadata), row.id);
        })();

        return metadata;
    }

    async create(workspace: Workspace, trajectories: Trajectory[]): Promise<{ record: StoredWorkspaceRecord; batch: Batch }> {
        const id = randomUUID();
        const ingestionToken = randomUUID();
        const batchId = randomUUID();
        const now = new Date().toISOString();

        const withColors = ensureTrajectoryColors(workspace, trajectories);
        const batchData: BatchData = { trajectories, valueClusterings: [] };

        getDb().transaction(() => {
            getDb().prepare(
                `INSERT INTO workspaces (id, data, ingestion_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
            ).run(id, JSON.stringify(withColors), ingestionToken, now, now);
            getDb().prepare(
                `INSERT INTO batches (id, workspace_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
            ).run(batchId, id, JSON.stringify(batchData), now, now);
        })();

        return {
            record: { id, workspace: withColors, ingestionToken, createdAt: now, updatedAt: now },
            batch: { id: batchId, createdAt: now },
        };
    }

    async getById(id: string): Promise<StoredWorkspaceRecord | null> {
        const row = getDb().prepare(`SELECT * FROM workspaces WHERE id = ?`).get(id) as WorkspaceRow | undefined;
        if (!row) return null;

        return {
            id: row.id,
            workspace: this.migrateLegacyShapeIfNeeded(row),
            ingestionToken: row.ingestion_token,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    async listBatches(workspaceId: string): Promise<Batch[]> {
        const rows = getDb()
            .prepare(`SELECT id, created_at FROM batches WHERE workspace_id = ? ORDER BY created_at ASC`)
            .all(workspaceId) as { id: string; created_at: string }[];
        return rows.map(batchRowToBatch);
    }

    async replace(id: string, workspace: Workspace): Promise<StoredWorkspaceRecord | null> {
        const existing = await this.getById(id);
        if (!existing) return null;

        const now = new Date().toISOString();
        getDb().prepare(`UPDATE workspaces SET data = ?, updated_at = ? WHERE id = ?`).run(
            JSON.stringify(workspace),
            now,
            id,
        );

        return { ...existing, workspace, updatedAt: now };
    }

    async getBatchData(workspaceId: string, batchId: string): Promise<BatchData | null> {
        // Ensures a legacy (pre-batching) workspace has already been lazily migrated into
        // the batches table — without this, a workspace that's never been read via getById
        // would look like it has no batches at all, even though its data just hasn't been
        // split out of the old blob yet.
        const workspace = await this.getById(workspaceId);
        if (!workspace) return null;

        const row = getDb()
            .prepare(`SELECT data FROM batches WHERE workspace_id = ? AND id = ?`)
            .get(workspaceId, batchId) as { data: string } | undefined;
        return row ? (JSON.parse(row.data) as BatchData) : null;
    }

    async replaceBatchValueClusterings(
        workspaceId: string,
        batchId: string,
        valueClusterings: ValueClustering[],
    ): Promise<BatchData | null> {
        const existing = await this.getBatchData(workspaceId, batchId);
        if (!existing) return null;

        const updated: BatchData = { ...existing, valueClusterings };
        const now = new Date().toISOString();
        getDb().prepare(`UPDATE batches SET data = ?, updated_at = ? WHERE workspace_id = ? AND id = ?`).run(
            JSON.stringify(updated),
            now,
            workspaceId,
            batchId,
        );

        return updated;
    }

    async appendTrajectoryBatch(workspaceId: string, trajectories: Trajectory[]): Promise<{ batch: Batch; data: BatchData } | null> {
        const existing = await this.getById(workspaceId);
        if (!existing) return null;

        const batchId = randomUUID();
        const now = new Date().toISOString();
        const data: BatchData = { trajectories, valueClusterings: [] };
        const withColors = ensureTrajectoryColors(existing.workspace, trajectories);

        getDb().transaction(() => {
            getDb().prepare(
                `INSERT INTO batches (id, workspace_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
            ).run(batchId, workspaceId, JSON.stringify(data), now, now);
            getDb().prepare(`UPDATE workspaces SET data = ?, updated_at = ? WHERE id = ?`).run(
                JSON.stringify(withColors),
                now,
                workspaceId,
            );
        })();

        return { batch: { id: batchId, createdAt: now }, data };
    }

    async verifyIngestionToken(id: string, token: string): Promise<boolean> {
        const row = getDb()
            .prepare(`SELECT 1 FROM workspaces WHERE id = ? AND ingestion_token = ?`)
            .get(id, token);
        return row !== undefined;
    }
}

export const sqliteWorkspaceRepository: WorkspaceRepository = new SqliteWorkspaceRepository();
