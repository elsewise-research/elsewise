import { Workspace } from "@/models/Workspace";
import { Dimension, DimensionId } from "@/models/Dimension";
import { ValueClustering, TrajectoryMoment, DIMENSION_VALUE_SEPARATOR } from "@/models/ValueClustering";

const momentKey = (moment: TrajectoryMoment) => `${moment.trajectoryId}::${moment.turnId}`;

// Order-independent identity for a set of dimension ids — two ValueClusterings span the
// same combination iff their dimensionIds produce the same key here.
export const dimensionIdsKeyOf = (ids: DimensionId[]) => [...ids].sort().join("|");

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
    const combinedKey = dimensionIdsKeyOf(crossed.dimensionIds);
    const existingIndex = valueClusterings.findIndex(
        (vc) => dimensionIdsKeyOf(vc.dimensionIds) === combinedKey,
    );

    const updated = [...valueClusterings];
    if (existingIndex >= 0) {
        updated[existingIndex] = crossed;
    } else {
        updated.push(crossed);
    }
    return updated;
}

// Removes a dimension from the workspace. Value clusterings are batch-scoped and live
// separately; any batch's clustering referencing this dimension simply stops being rendered
// once the dimension is gone from workspace.dimensions (nodes are only ever built from that
// list), so there's nothing to clean up here.
export function deleteDimension(workspace: Workspace, dimensionId: DimensionId): Workspace {
    const dimensions = (workspace.dimensions ?? []).filter((dimension) => dimension.id !== dimensionId);
    return { ...workspace, dimensions };
}

// A fresh ValueClustering for a dimension: one entry per known value, each starting
// with no trajectory moments assigned yet.
export function emptyValueClustering(dimension: Dimension): ValueClustering {
    return {
        dimensionIds: [dimension.id],
        valueMapping: Object.fromEntries(
            dimension.values.map((value): [string, TrajectoryMoment[]] => [value, []]),
        ),
    };
}

// A fresh composite ValueClustering for a dimension combination that hasn't been crossed
// for the batch currently being viewed yet.
export function emptyCompositeClustering(dimensionIds: DimensionId[]): ValueClustering {
    return { dimensionIds, valueMapping: {} };
}

// Appends a single new dimension onto the workspace, leaving existing dimensions untouched.
// Dimensions are workspace-global; their value clusterings are batch-scoped and live
// separately (see src/models/Batch.ts), so there's no clustering to create here.
export function appendDimension(workspace: Workspace, dimension: Dimension): Workspace {
    return {
        ...workspace,
        dimensions: [...(workspace.dimensions ?? []), dimension],
    };
}

// Recomputes a (possibly N-ary) composite ValueClustering for `dimensionIds` by folding
// crossValueClusterings across each dimension's current simple (length-1) ValueClustering
// in `valueClusterings`. Fold order doesn't matter since intersection is commutative/associative.
// Returns null if any constituent simple dimension has no ValueClustering yet.
export function recomputeComposite(valueClusterings: ValueClustering[], dimensionIds: DimensionId[]): ValueClustering | null {
    let result: ValueClustering | null = null;
    for (const dimensionId of dimensionIds) {
        const simple = valueClusterings.find(
            (vc) => vc.dimensionIds.length === 1 && vc.dimensionIds[0] === dimensionId,
        );
        if (!simple) return null;
        result = result ? crossValueClusterings(result, simple) : simple;
    }
    return result;
}

// Removes the ValueClustering spanning exactly this set of dimensions (order-independent)
// from one batch's valueClusterings, leaving the underlying simple dimensions and their own
// clusterings untouched. Use this to discard a composite (crossed) clustering without
// deleting the dimensions it was built from.
export function deleteValueClustering(valueClusterings: ValueClustering[], dimensionIds: DimensionId[]): ValueClustering[] {
    const key = dimensionIdsKeyOf(dimensionIds);
    return valueClusterings.filter((vc) => dimensionIdsKeyOf(vc.dimensionIds) !== key);
}

// Merges freshly computed valueClusterings into an existing array: replacing any entry
// that shares a dimensionIds key with one just computed, leaving everything else (including
// composites) untouched.
export function mergeValueClusterings(existing: ValueClustering[], fresh: ValueClustering[]): ValueClustering[] {
    const freshKeys = new Set(fresh.map((vc) => dimensionIdsKeyOf(vc.dimensionIds)));
    const preserved = existing.filter((vc) => !freshKeys.has(dimensionIdsKeyOf(vc.dimensionIds)));
    return [...preserved, ...fresh];
}

