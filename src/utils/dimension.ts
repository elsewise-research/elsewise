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

// Renames a value within a dimension: updates the dimension's values list in place (same
// position) and, in `valueClusterings` (one batch's), renames the matching segment of the key
// for the dimension's own simple ValueClustering and any composite built from it. A no-op
// (returning the same `dimension`/`valueClusterings` references) if oldValue isn't known, the
// new name is blank, or it's unchanged.
export function renameDimensionValue(
    dimension: Dimension,
    valueClusterings: ValueClustering[],
    oldValue: string,
    newValue: string,
): { dimension: Dimension; valueClusterings: ValueClustering[] } {
    const trimmed = newValue.trim();
    if (!trimmed || trimmed === oldValue || !dimension.values.includes(oldValue)) {
        return { dimension, valueClusterings };
    }

    const updatedDimension: Dimension = {
        ...dimension,
        values: dimension.values.map((value) => (value === oldValue ? trimmed : value)),
    };

    const updatedValueClusterings = valueClusterings.map((vc) => {
        const dimIndex = vc.dimensionIds.indexOf(dimension.id);
        if (dimIndex === -1) return vc;

        const valueMapping: Record<string, TrajectoryMoment[]> = {};
        for (const [key, moments] of Object.entries(vc.valueMapping)) {
            const parts = key.split(DIMENSION_VALUE_SEPARATOR);
            if (parts[dimIndex] === oldValue) parts[dimIndex] = trimmed;
            const newKey = parts.join(DIMENSION_VALUE_SEPARATOR);
            valueMapping[newKey] = [...(valueMapping[newKey] ?? []), ...moments];
        }
        return { ...vc, valueMapping };
    });

    return { dimension: updatedDimension, valueClusterings: updatedValueClusterings };
}

// Deletes a value from a dimension: removes it from the values list, and drops any
// valueClustering entry (simple or composite) whose key includes that value for this
// dimension — the trajectory moments assigned to it become unclustered for this dimension
// (and anything composed from it) until re-clustered. A no-op if the value isn't known.
export function deleteDimensionValue(
    dimension: Dimension,
    valueClusterings: ValueClustering[],
    value: string,
): { dimension: Dimension; valueClusterings: ValueClustering[] } {
    if (!dimension.values.includes(value)) {
        return { dimension, valueClusterings };
    }

    const updatedDimension: Dimension = {
        ...dimension,
        values: dimension.values.filter((v) => v !== value),
    };

    const updatedValueClusterings = valueClusterings.map((vc) => {
        const dimIndex = vc.dimensionIds.indexOf(dimension.id);
        if (dimIndex === -1) return vc;

        const valueMapping: Record<string, TrajectoryMoment[]> = {};
        for (const [key, moments] of Object.entries(vc.valueMapping)) {
            if (key.split(DIMENSION_VALUE_SEPARATOR)[dimIndex] === value) continue;
            valueMapping[key] = moments;
        }
        return { ...vc, valueMapping };
    });

    return { dimension: updatedDimension, valueClusterings: updatedValueClusterings };
}

// Adds a new value to a dimension (a no-op, returning the same references, if it's blank or
// already present), and seeds an empty moment list for it in the dimension's own simple
// ValueClustering within `valueClusterings` if one is present there.
export function addDimensionValue(
    dimension: Dimension,
    valueClusterings: ValueClustering[],
    value: string,
): { dimension: Dimension; valueClusterings: ValueClustering[] } {
    const trimmed = value.trim();
    if (!trimmed || dimension.values.includes(trimmed)) {
        return { dimension, valueClusterings };
    }

    const updatedDimension: Dimension = { ...dimension, values: [...dimension.values, trimmed] };

    const updatedValueClusterings = valueClusterings.map((vc) => {
        if (vc.dimensionIds.length !== 1 || vc.dimensionIds[0] !== dimension.id) return vc;
        if (vc.valueMapping[trimmed]) return vc;
        return { ...vc, valueMapping: { ...vc.valueMapping, [trimmed]: [] } };
    });

    return { dimension: updatedDimension, valueClusterings: updatedValueClusterings };
}

// Swaps a value with its neighbor in the dimension's values list to shift its display order.
// A no-op (same `dimension` reference) if the value is unknown or already at that end.
export function moveDimensionValue(dimension: Dimension, value: string, direction: "up" | "down"): Dimension {
    const index = dimension.values.indexOf(value);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || targetIndex < 0 || targetIndex >= dimension.values.length) {
        return dimension;
    }

    const values = [...dimension.values];
    [values[index], values[targetIndex]] = [values[targetIndex], values[index]];
    return { ...dimension, values };
}

// Merges freshly computed valueClusterings into an existing array: replacing any entry
// that shares a dimensionIds key with one just computed, leaving everything else (including
// composites) untouched.
export function mergeValueClusterings(existing: ValueClustering[], fresh: ValueClustering[]): ValueClustering[] {
    const freshKeys = new Set(fresh.map((vc) => dimensionIdsKeyOf(vc.dimensionIds)));
    const preserved = existing.filter((vc) => !freshKeys.has(dimensionIdsKeyOf(vc.dimensionIds)));
    return [...preserved, ...fresh];
}

