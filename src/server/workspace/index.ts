import "server-only";
import { WorkspaceRepository } from "./types";
import { sqliteWorkspaceRepository } from "./sqliteRepository";
import { neonWorkspaceRepository } from "./neonRepository";

export function getWorkspaceRepository(): WorkspaceRepository {
    const driver = process.env.WORKSPACE_DB_DRIVER ?? "sqlite";
    switch (driver) {
        case "sqlite":
            return sqliteWorkspaceRepository;
        case "postgres":
            return neonWorkspaceRepository;
        default:
            throw new Error(`Unsupported WORKSPACE_DB_DRIVER: ${driver}`);
    }
}

export type { WorkspaceRepository, StoredWorkspaceRecord } from "./types";
