import { Trajectory } from "./Trajectory";
import { ValueClustering } from "./ValueClustering";

export type BatchId = string;

export type Batch = {
    id: BatchId;
    createdAt: string;
};

export type BatchData = {
    trajectories: Trajectory[];
    valueClusterings: ValueClustering[];
};
