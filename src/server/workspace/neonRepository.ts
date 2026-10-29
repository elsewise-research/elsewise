import "server-only";
import { randomUUID } from "crypto";
import { Pool, neonConfig, type PoolClient } from "@neondatabase/serverless";
import ws from "ws";
import { Workspace } from "@/models/Workspace";
import { Trajectory } from "@/models/Trajectory";
import { ValueClustering } from "@/models/ValueClustering";
import { Batch, BatchData } from "@/models/Batch";
import { ensureTrajectoryColors } from "@/utils/trajectory";
import { StoredWorkspaceRecord, WorkspaceRepository } from "./types";

type WorkspaceRow = {
    id: string;
    data: Workspace; // JSONB — the driver hands this back already parsed, no JSON.parse needed.
    ingestion_token: string;
    created_at: string;
    updated_at: string;
};

function rowToRecord(row: WorkspaceRow): StoredWorkspaceRecord {
    return {
        id: row.id,
        workspace: row.data,
        ingestionToken: row.ingestion_token,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function batchRowToBatch(row: { id: string; created_at: string }): Batch {
    return { id: row.id, createdAt: row.created_at };
}

// Cached on globalThis so a warm serverless instance (or Next's dev-mode module
// re-evaluation) reuses one pool instead of opening a new one per request — same
// reasoning as sqliteRepository.ts's getDb() caching, adapted for a network connection
// instead of a file handle.
const globalForPool = globalThis as unknown as { __workspacePool?: Pool };

// Pool (unlike Neon's lightweight HTTP driver) needs a WebSocket constructor to run in
// Node.js — built in as of Node 22, but not before, and Vercel's configured Node version
// isn't guaranteed to be 22+, so this is supplied explicitly rather than left to chance.
neonConfig.webSocketConstructor = ws;

function getPool(): Pool {
    if (!globalForPool.__workspacePool) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error("DATABASE_URL is not set — required when WORKSPACE_DB_DRIVER=postgres");
        }
        globalForPool.__workspacePool = new Pool({ connectionString });
    }
    return globalForPool.__workspacePool;
}

// Runs `fn` inside a BEGIN/COMMIT transaction on a single checked-out connection, rolling
// back on any error. Needed because create() and appendTrajectoryBatch() each make two
// writes (insert a batch row + update the workspace row) that must land together — Neon's
// lightweight HTTP driver doesn't support multi-statement transactions, which is why this
// repository uses the WebSocket-based Pool/PoolClient instead.
async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await getPool().connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

class NeonWorkspaceRepository implements WorkspaceRepository {
    async create(workspace: Workspace, trajectories: Trajectory[]): Promise<{ record: StoredWorkspaceRecord; batch: Batch }> {
        const id = randomUUID();
        const ingestionToken = randomUUID();
        const batchId = randomUUID();
        const now = new Date().toISOString();

        const withColors = ensureTrajectoryColors(workspace, trajectories);
        const batchData: BatchData = { trajectories, valueClusterings: [] };

        await withTransaction(async (client) => {
            await client.query(
                `INSERT INTO workspaces (id, data, ingestion_token, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
                [id, JSON.stringify(withColors), ingestionToken, now, now],
            );
            await client.query(
                `INSERT INTO batches (id, workspace_id, data, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
                [batchId, id, JSON.stringify(batchData), now, now],
            );
        });

        return {
            record: { id, workspace: withColors, ingestionToken, createdAt: now, updatedAt: now },
            batch: { id: batchId, createdAt: now },
        };
    }

    async getById(id: string): Promise<StoredWorkspaceRecord | null> {
        const result = await getPool().query(`SELECT * FROM workspaces WHERE id = $1`, [id]);
        const row = result.rows[0] as WorkspaceRow | undefined;
        return row ? rowToRecord(row) : null;
    }

    async listBatches(workspaceId: string): Promise<Batch[]> {
        const result = await getPool().query(
            `SELECT id, created_at FROM batches WHERE workspace_id = $1 ORDER BY created_at ASC`,
            [workspaceId],
        );
        return (result.rows as { id: string; created_at: string }[]).map(batchRowToBatch);
    }

    async replace(id: string, workspace: Workspace): Promise<StoredWorkspaceRecord | null> {
        const existing = await this.getById(id);
        if (!existing) return null;

        const now = new Date().toISOString();
        await getPool().query(
            `UPDATE workspaces SET data = $1, updated_at = $2 WHERE id = $3`,
            [JSON.stringify(workspace), now, id],
        );

        return { ...existing, workspace, updatedAt: now };
    }

    async getBatchData(workspaceId: string, batchId: string): Promise<BatchData | null> {
        // Mirrors sqliteRepository's self-check: confirm the workspace exists before
        // trusting a (possibly nonexistent) batch lookup.
        const workspace = await this.getById(workspaceId);
        if (!workspace) return null;

        const result = await getPool().query(
            `SELECT data FROM batches WHERE workspace_id = $1 AND id = $2`,
            [workspaceId, batchId],
        );
        const row = result.rows[0] as { data: BatchData } | undefined;
        return row ? row.data : null;
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
        await getPool().query(
            `UPDATE batches SET data = $1, updated_at = $2 WHERE workspace_id = $3 AND id = $4`,
            [JSON.stringify(updated), now, workspaceId, batchId],
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

        await withTransaction(async (client) => {
            await client.query(
                `INSERT INTO batches (id, workspace_id, data, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
                [batchId, workspaceId, JSON.stringify(data), now, now],
            );
            await client.query(
                `UPDATE workspaces SET data = $1, updated_at = $2 WHERE id = $3`,
                [JSON.stringify(withColors), now, workspaceId],
            );
        });

        return { batch: { id: batchId, createdAt: now }, data };
    }

    async verifyIngestionToken(id: string, token: string): Promise<boolean> {
        const result = await getPool().query(
            `SELECT 1 FROM workspaces WHERE id = $1 AND ingestion_token = $2`,
            [id, token],
        );
        return result.rows.length > 0;
    }
}

export const neonWorkspaceRepository: WorkspaceRepository = new NeonWorkspaceRepository();
