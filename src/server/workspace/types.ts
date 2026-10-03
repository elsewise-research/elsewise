import { Workspace } from "@/models/Workspace";
import { Trajectory } from "@/models/Trajectory";
import { ValueClustering } from "@/models/ValueClustering";
import { Batch, BatchData } from "@/models/Batch";

export type StoredWorkspaceRecord = {
    id: string;
    workspace: Workspace;
    ingestionToken: string;
    createdAt: string;
    updatedAt: string;
};

export interface WorkspaceRepository {
    create(workspace: Workspace, trajectories: Trajectory[]): Promise<{ record: StoredWorkspaceRecord; batch: Batch }>;
    getById(id: string): Promise<StoredWorkspaceRecord | null>;
    listBatches(workspaceId: string): Promise<Batch[]>;
    // Replaces workspace metadata (title, domainDescription, dimensions, settings). Trajectories
    // and value clusterings aren't part of this anymore — they live in their own per-batch rows.
    replace(id: string, workspace: Workspace): Promise<StoredWorkspaceRecord | null>;
    getBatchData(workspaceId: string, batchId: string): Promise<BatchData | null>;
    replaceBatchValueClusterings(
        workspaceId: string,
        batchId: string,
        valueClusterings: ValueClustering[],
    ): Promise<BatchData | null>;
    appendTrajectoryBatch(workspaceId: string, trajectories: Trajectory[]): Promise<{ batch: Batch; data: BatchData } | null>;
    verifyIngestionToken(id: string, token: string): Promise<boolean>;
}
