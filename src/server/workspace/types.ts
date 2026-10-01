import { Workspace } from "@/models/Workspace";
import { Trajectory } from "@/models/Trajectory";

export type StoredWorkspaceRecord = {
    id: string;
    workspace: Workspace;
    ingestionToken: string;
    createdAt: string;
    updatedAt: string;
};

export interface WorkspaceRepository {
    create(workspace: Workspace): Promise<StoredWorkspaceRecord>;
    getById(id: string): Promise<StoredWorkspaceRecord | null>;
    // Replaces everything except `trajectories`, which is always preserved as-is from
    // the stored record — keeps a stale editor snapshot from ever being able to wipe out
    // trajectories an external tool appended after that snapshot was loaded.
    replace(id: string, workspace: Workspace): Promise<StoredWorkspaceRecord | null>;
    appendTrajectories(id: string, trajectories: Trajectory[]): Promise<StoredWorkspaceRecord | null>;
    verifyIngestionToken(id: string, token: string): Promise<boolean>;
}
