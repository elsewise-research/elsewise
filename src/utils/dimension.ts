import { Workspace } from "@/models/Workspace";
import { Dimension, DimensionId } from "@/models/Dimension";
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

// Removes a dimension and any ValueClustering that references it. A composite (crossed)
// ValueClustering can't be safely reduced by dropping just one of its dimensions without
// its original per-dimension components, so it's dropped entirely rather than patched.
export function deleteDimension(workspace: Workspace, dimensionId: DimensionId): Workspace {
    const dimensions = (workspace.dimensions ?? []).filter((dimension) => dimension.id !== dimensionId);
    const valueClusterings = (workspace.valueClusterings ?? []).filter(
        (vc) => !vc.dimensionIds.includes(dimensionId),
    );

    return { ...workspace, dimensions, valueClusterings };
}

// A fresh ValueClustering for a dimension: one entry per known value, each starting
// with no trajectory moments assigned yet.
function emptyValueClustering(dimension: Dimension): ValueClustering {
    return {
        dimensionIds: [dimension.id],
        valueMapping: Object.fromEntries(
            dimension.values.map((value): [string, TrajectoryMoment[]] => [value, []]),
        ),
    };
}

// Appends a single new dimension (and a fresh ValueClustering for it) onto the workspace,
// leaving existing dimensions and their clusterings untouched.
export function appendDimension(workspace: Workspace, dimension: Dimension): Workspace {
    return {
        ...workspace,
        dimensions: [...(workspace.dimensions ?? []), dimension],
        valueClusterings: [...(workspace.valueClusterings ?? []), emptyValueClustering(dimension)],
    };
}

// Removes the ValueClustering spanning exactly this set of dimensions (order-independent),
// leaving the underlying simple dimensions and their own clusterings untouched. Use this to
// discard a composite (crossed) clustering without deleting the dimensions it was built from.
export function deleteValueClustering(workspace: Workspace, dimensionIds: DimensionId[]): Workspace {
    const key = [...dimensionIds].sort().join("|");
    const valueClusterings = (workspace.valueClusterings ?? []).filter(
        (vc) => [...vc.dimensionIds].sort().join("|") !== key,
    );

    return { ...workspace, valueClusterings };
}

