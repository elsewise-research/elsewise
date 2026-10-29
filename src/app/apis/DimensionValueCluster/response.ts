import { DimensionValueClusterInputType, DimensionValueClusterOutputType } from '../types';
import { callLLM, ApiLine, LLMAuthError } from '../LLM';
import { getCacheablePrefix, getDimensionInstructions, getSystemPrompt } from './prompt';
import { TrajectoryMoment } from '@/models/ValueClustering';
import { safeJsonParse } from '@/utils/jsonParser';

type TurnValueAssignment = {
    trajectoryId: string;
    turnId: string;
    value: string;
};

// Clusters trajectory moments into one dimension's values. One call = one dimension, so the
// model only ever has to generate one value per turn, not one per dimension per turn — the
// client (clusterDimensionValues in page.tsx) is responsible for fanning this out across
// multiple dimensions (one priming call, then the rest in parallel against the now-cached
// prefix) and for updating the UI as each one resolves. Errors are caught here, not
// propagated, so one dimension failing to parse doesn't surface as a failed request — it
// just comes back with nothing clustered.
export async function dimensionValueCluster(input: DimensionValueClusterInputType): Promise<DimensionValueClusterOutputType> {
    const { trajectories, dimension, domainDescription, llmCredentials } = input;

    try {
        const knownTurnKeys = new Set<string>();
        for (const trajectory of trajectories) {
            for (const turn of trajectory.turns) {
                knownTurnKeys.add(`${trajectory.id}::${turn.id}`);
            }
        }

        const messages: ApiLine[] = [
            {
                role: 'user',
                content: [
                    // Cache-marked so repeated calls against the same batch (another dimension,
                    // or a later re-cluster) skip reprocessing this shared, often-large block.
                    { type: 'text', text: getCacheablePrefix({ trajectories, domainDescription }), cache_control: { type: 'ephemeral' } },
                    { type: 'text', text: getDimensionInstructions({ dimension }) },
                ],
            },
        ];

        const text = await callLLM(getSystemPrompt(), messages, {}, llmCredentials);
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

        return { valueClustering: { dimensionIds: [dimension.id], valueMapping } };
    } catch (error) {
        if (error instanceof LLMAuthError) throw error;

        console.error(`Error clustering dimension ${dimension.id}:`, error);
        return { valueClustering: { dimensionIds: [dimension.id], valueMapping: {} } };
    }
}
