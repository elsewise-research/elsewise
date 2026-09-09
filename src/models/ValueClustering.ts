import { FluentId } from "./Fluent";
import { TrajectoryId, RoundId } from "./Trajectory";

// Fluent value separator
export const FLUENT_VALUE_SEPARATOR = "_";

export type ValueClustering = {
    fluentIds: FluentId[];
    valueMapping: Record<string, TrajectoryMoment[]>; // for multiple fluents, the key is the flattend single string of the value combination (concatenated by FLUENT_VALUE_SEPARATOR), e.g., "value1_value2_value3"
}

export type TrajectoryMoment = {
    trajectoryId: TrajectoryId;
    roundId: RoundId;
}