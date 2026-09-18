import { Trajectory } from "./Trajectory";
import { Dimension, DimensionId } from "./Dimension";
import { ValueClustering } from "./ValueClustering";

export type Workspace = {
    domainDescription?: string;
    trajectories?: Trajectory[];
    dimensions?: Dimension[];
    valueClusterings?: ValueClustering[];
    prevValueClusterings?: ValueClustering[];
    settings?: WorkspaceSetting;
};

export type WorkspaceSetting = {
    nodePosition?: { [key: string]: { x: number; y: number } };
    viewport?: { x: number; y: number; zoom: number };
    timelineView?: {
      [dimensionId: DimensionId]: {
        enabled: boolean;
      };
    };
};
