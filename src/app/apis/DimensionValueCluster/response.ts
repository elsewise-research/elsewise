import { DimensionValueClusterInputType, DimensionValueClusterOutputType } from '../types';
import { callAnthropicAPI, ApiLine } from '../LLM';
import { getCacheablePrefix, getDimensionInstructions, getSystemPrompt } from './prompt';
import { ValueClustering, TrajectoryMoment } from '@/models/ValueClustering';
import { Dimension } from '@/models/Dimension';
import { safeJsonParse } from '@/utils/jsonParser';

type TurnValueAssignment = {
    trajectoryId: string;
    turnId: string;
    value: string;
};

export async function dimensionValueCluster(input: DimensionValueClusterInputType): Promise<DimensionValueClusterOutputType> {
    const { trajectories, dimensions, domainDescription } = input;
    if (dimensions.length === 0) return { valueClusterings: [] };

    const knownTurnKeys = new Set<string>();
    for (const trajectory of trajectories) {
        for (const turn of trajectory.turns) {
            knownTurnKeys.add(`${trajectory.id}::${turn.id}`);
        }
    }

    // Shared by every dimension's call below, marked cacheable so the model only pays full
    // input-processing cost for it once per batch (cache TTL permitting), not once per
    // dimension — see getCacheablePrefix.
    const cacheablePrefix = getCacheablePrefix({ trajectories, domainDescription });
    const buildMessages = (dimension: Dimension): ApiLine[] => [
        {
            role: 'user',
            content: [
                { type: 'text', text: cacheablePrefix, cache_control: { type: 'ephemeral' } },
                { type: 'text', text: getDimensionInstructions({ dimension }) },
            ],
        },
    ];

    // The first call runs alone to prime the cache: if every dimension's call fired at once,
    // they could all race the cache write before it's visible to each other, turning into N
    // writes instead of 1 write + (N-1) reads. Once this one lands, the rest can safely run
    // in parallel against the now-cached prefix.
    const [firstDimension, ...restDimensions] = dimensions;
    const firstResult = await clusterSingleDimension(firstDimension, buildMessages(firstDimension), knownTurnKeys);
    const restResults = await Promise.all(
        restDimensions.map((dimension) => clusterSingleDimension(dimension, buildMessages(dimension), knownTurnKeys)),
    );

    return { valueClusterings: [firstResult, ...restResults] };
}

// Each dimension is clustered independently so one dimension's bad/unparseable response
// doesn't discard every other dimension's result, and so the model only ever has to generate
// one value per turn per call instead of one per dimension per turn.
async function clusterSingleDimension(
    dimension: Dimension,
    messages: ApiLine[],
    knownTurnKeys: Set<string>,
): Promise<ValueClustering> {
    try {
        const text = await callAnthropicAPI(getSystemPrompt(), messages);
        console.log(`Dimension value cluster raw result for ${dimension.id}:`, text);

        const assignments = safeJsonParse<TurnValueAssignment[]>(text, 'valueAssignments') ?? [];

        const valueMapping: Record<string, TrajectoryMoment[]> = {};
        for (const { trajectoryId, turnId, value } of assignments) {
            if (!value || !knownTurnKeys.has(`${trajectoryId}::${turnId}`)) continue;

            if (!valueMapping[value]) {
                valueMapping[value] = [];
            }
            valueMapping[value].push({ trajectoryId, turnId });
        }

        return { dimensionIds: [dimension.id], valueMapping };
    } catch (error) {
        console.error(`Error clustering dimension ${dimension.id}:`, error);
        return { dimensionIds: [dimension.id], valueMapping: {} };
    }
}
