import { Trajectory } from "@/models/Trajectory";
import { Dimension } from "@/models/Dimension";
import { ValueClustering } from "@/models/ValueClustering";

export type ExtractDimensionInputType = {
    trajectories : Trajectory[];
    numDimensions? : number;
    domainDescription? : string;
};

export type ExtractDimensionOutputType = {
    dimensions : Dimension[];
    valueClusterings : ValueClustering[];
};

export type DimensionValueClusterInputType = {
    trajectories : Trajectory[];
    dimensions: Dimension[];
    domainDescription? : string;
};

export type DimensionValueClusterOutputType = {
    valueClusterings : ValueClustering[];
};