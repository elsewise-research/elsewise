import { DimensionId } from "./Dimension";
import { TrajectoryId, RoundId } from "./Trajectory";

// Dimension value separator
export const DIMENSION_VALUE_SEPARATOR = "_";

export type ValueClustering = {
    dimensionIds: DimensionId[];
    valueMapping: Record<string, TrajectoryMoment[]>; // for multiple dimensions, the key is the flattend single string of the value combination (concatenated by DIMENSION_VALUE_SEPARATOR), e.g., "value1_value2_value3"
}

export type TrajectoryMoment = {
    trajectoryId: TrajectoryId;
    roundId: RoundId;
}
