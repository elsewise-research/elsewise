import { Trajectory } from "@/models/Trajectory";
import { Dimension } from "@/models/Dimension";
import { ValueClustering } from "@/models/ValueClustering";

export type ExtractDimensionInputType = {
    trajectories : Trajectory[];
    numDimensions? : number;
};

export type ExtractDimensionOutputType = {
    dimensions : Dimension[];
    valueClusterings : ValueClustering[];
};