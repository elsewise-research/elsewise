import { Trajectory } from "./Trajectory";
import { Fluent, FluentId } from "./Fluent";
import { ValueClustering } from "./ValueClustering";

export type Workspace = {
    trajectories?: Trajectory[];
    fluents?: Fluent[];
    valueClusterings?: ValueClustering[];
    prevValueClusterings?: ValueClustering[];
    settings?: WorkspaceSetting;
};

export type WorkspaceSetting = {
    nodePosition?: { [key: string]: { x: number; y: number } };
    viewport?: { x: number; y: number; zoom: number };
    timelineView?: {
      [fluentId: FluentId]: {
        enabled: boolean;
      };
    };
};