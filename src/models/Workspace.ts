import { Dimension, DimensionId } from "./Dimension";

export type Workspace = {
    title?: string;
    domainDescription?: string;
    dimensions?: Dimension[];
    settings?: WorkspaceSetting;
};

export type WorkspaceSetting = {
    trajectoryColors? : {[trajactoryId: string]: {color: string}};
    nodePosition?: { [key: string]: { x: number; y: number } };
    viewport?: { x: number; y: number; zoom: number };
    compactView?: {
      [dimensionId: DimensionId]: {
        enabled: boolean;
      };
    };
    matrixView?: {
      [dimensionIdsKey: string]: {
        enabled: boolean;
      };
    };
};
