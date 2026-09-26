import { ValueClustering, TrajectoryMoment, DIMENSION_VALUE_SEPARATOR } from "@/models/ValueClustering";

const momentKey = (moment: TrajectoryMoment) => `${moment.trajectoryId}::${moment.turnId}`;

// Crosses two ValueClusterings (each covering one or more dimensions) into one ValueClustering
// spanning both sets of dimensions: each entry pairs a value combination from A with one from B,
// mapped to the trajectory moments that fall under both (i.e. the same moment appears in both
// source value combination's moment lists). Composite keys are joined with DIMENSION_VALUE_SEPARATOR,
// so crossing an already-composite key with another preserves the "value1_value2_value3" convention.
function crossValueClusterings(vcA: ValueClustering, vcB: ValueClustering): ValueClustering {
    const valueMapping: Record<string, TrajectoryMoment[]> = {};

    for (const [valueA, momentsA] of Object.entries(vcA.valueMapping)) {
        const keysA = new Set(momentsA.map(momentKey));
        for (const [valueB, momentsB] of Object.entries(vcB.valueMapping)) {
            const intersection = momentsB.filter((moment) => keysA.has(momentKey(moment)));
            if (intersection.length > 0) {
                valueMapping[`${valueA}${DIMENSION_VALUE_SEPARATOR}${valueB}`] = intersection;
            }
        }
    }

    return { dimensionIds: [...vcA.dimensionIds, ...vcB.dimensionIds], valueMapping };
}

// Crosses vcA and vcB, then merges the result into valueClusterings: replacing any existing
// entry that already spans the same combined set of dimensions, or appending a new one.
export function crossDimensions(
    valueClusterings: ValueClustering[],
    vcA: ValueClustering,
    vcB: ValueClustering,
): ValueClustering[] {
    const crossed = crossValueClusterings(vcA, vcB);
    const combinedKey = [...crossed.dimensionIds].sort().join("|");
    const existingIndex = valueClusterings.findIndex(
        (vc) => vc.dimensionIds.length === crossed.dimensionIds.length
            && [...vc.dimensionIds].sort().join("|") === combinedKey,
    );

    const updated = [...valueClusterings];
    if (existingIndex >= 0) {
        updated[existingIndex] = crossed;
    } else {
        updated.push(crossed);
    }
    return updated;
}
