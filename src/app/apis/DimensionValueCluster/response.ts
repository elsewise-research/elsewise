import { DimensionValueClusterInputType, DimensionValueClusterOutputType } from '../types';
import { callAnthropicAPI } from '../LLM';
import { getPrompt, getSystemPrompt } from './prompt';
import { ValueClustering, TrajectoryMoment } from '@/models/ValueClustering';
import { safeJsonParse } from '@/utils/jsonParser';

type TurnValueAssignment = {
    trajectoryId: string;
    turnId: string;
    values: Record<string, string>;
};

export async function dimensionValueCluster(input: DimensionValueClusterInputType): Promise<DimensionValueClusterOutputType> {

    try {

    const {trajectories, dimensions, domainDescription} = input

    const text = await callAnthropicAPI(
        getSystemPrompt(),
        [
          {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: getPrompt({
                    trajectories,
                    dimensions,
                    domainDescription
                }),
              },
            ],
          },
        ]
      );

    console.log("Dimension value cluster raw result:", text);

    const assignments = safeJsonParse<TurnValueAssignment[]>(text, 'valueAssignments') ?? [];

    const knownTurnKeys = new Set<string>();
    for (const trajectory of trajectories) {
        for (const turn of trajectory.turns) {
            knownTurnKeys.add(`${trajectory.id}::${turn.id}`);
        }
    }

    const valueClusterings: ValueClustering[] = dimensions.map((dimension) => {
        const valueMapping: Record<string, TrajectoryMoment[]> = {};

        for (const {trajectoryId, turnId, values} of assignments) {
            const value = values[dimension.id];
            if (!value || !knownTurnKeys.has(`${trajectoryId}::${turnId}`)) continue;

            if (!valueMapping[value]) {
                valueMapping[value] = [];
            }
            valueMapping[value].push({trajectoryId, turnId});
        }

        return {
            dimensionIds: [dimension.id],
            valueMapping,
        };
    });

    return {
        valueClusterings
    };

    } catch (error) {
        console.error('Error in clustering dimension values:', error);

        return {
            valueClusterings: []
        };

    }
}
