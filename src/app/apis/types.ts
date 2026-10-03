import { Trajectory } from "@/models/Trajectory";
import { Dimension } from "@/models/Dimension";
import { ValueClustering } from "@/models/ValueClustering";
import { Workspace } from "@/models/Workspace";
import { Batch, BatchData } from "@/models/Batch";

export type ExtractDimensionInputType = {
    trajectories : Trajectory[];
    numDimensions? : number;
    domainDescription? : string;
    // Dimensions already present in the workspace; the LLM is asked to propose
    // additional dimensions distinct from these rather than repeating them.
    existingDimensions? : Pick<Dimension, "name" | "description">[];
};

export type ExtractDimensionOutputType = {
    dimensions : Dimension[];
};

export type DimensionValueClusterInputType = {
    trajectories : Trajectory[];
    dimensions: Dimension[];
    domainDescription? : string;
};

export type DimensionValueClusterOutputType = {
    valueClusterings : ValueClustering[];
};

export type ExtractDimensionValuesInputType = {
    trajectories : Trajectory[];
    // dimensions may already carry user-specified values; the API extracts additional
    // values distinct from those, rather than overwriting them.
    dimensions : Pick<Dimension, "id" | "name" | "description" | "values">[];
    domainDescription? : string;
};

export type ExtractDimensionValuesOutputType = {
    dimensions : Dimension[];
    valueClusterings : ValueClustering[];
};

export type CreateWorkspaceInputType = {
    workspace : Workspace;
    trajectories : Trajectory[];
};

export type CreateWorkspaceOutputType = {
    id : string;
    ingestionToken : string;
    workspace : Workspace;
    batches : Batch[];
};

export type GetWorkspaceOutputType = {
    id : string;
    ingestionToken : string;
    workspace : Workspace;
    batches : Batch[];
};

export type ReplaceWorkspaceInputType = {
    workspace : Workspace;
};

export type ReplaceWorkspaceOutputType = {
    id : string;
    workspace : Workspace;
};

export type AppendTrajectoriesInputType = {
    trajectories : Trajectory[];
};

export type AppendTrajectoriesOutputType = {
    id : string;
    batch : Batch;
    appendedCount : number;
};

export type GetBatchDataOutputType = {
    batchId : string;
    data : BatchData;
};

export type ReplaceBatchValueClusteringsInputType = {
    valueClusterings : ValueClustering[];
};

export type ReplaceBatchValueClusteringsOutputType = {
    batchId : string;
    valueClusterings : ValueClustering[];
};