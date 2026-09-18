import { randomUUID } from 'crypto';
import { ExtractDimensionInputType, ExtractDimensionOutputType } from '../types';
import { callAnthropicAPI } from '../LLM';
import { getPrompt, getSystemPrompt } from './prompt';
import { Dimension } from '@/models/Dimension';
import { ValueClustering, TrajectoryMoment } from '@/models/ValueClustering';
import { safeJsonParse } from '@/utils/jsonParser';

export async function extractDimension(input: ExtractDimensionInputType): Promise<ExtractDimensionOutputType> {

    try {
    
    const {trajectories, numDimensions = 3, domainDescription} = input

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
                    numDimensions,
                    domainDescription
                }),
              },
            ],
          },
        ]
      );

    console.log("Extract dimension raw result:", text);

    const rawDimensions = safeJsonParse<Dimension[]>(text, 'dimensions') ?? [];
    const dimensions: Dimension[] = rawDimensions.map((dimension) => ({
        ...dimension,
        id: randomUUID(),
    }));

    const valueClusterings: ValueClustering[] = dimensions.map((dimension) => ({
        dimensionIds: [dimension.id],
        valueMapping: Object.fromEntries(
            dimension.values.map((value): [string, TrajectoryMoment[]] => [value, []]),
        ),
    }));

    return {
        dimensions,
        valueClusterings
    };

    } catch (error) {
        console.error('Error in extracting dimension:', error);

        return {
            dimensions: [], 
            valueClusterings: []
        };

    }
}