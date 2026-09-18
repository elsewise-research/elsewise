import { randomUUID } from 'crypto';
import { ExtractDimensionValuesInputType, ExtractDimensionValuesOutputType } from '../types';
import { callAnthropicAPI } from '../LLM';
import { getPrompt, getSystemPrompt } from './prompt';
import { Dimension } from '@/models/Dimension';
import { ValueClustering, TrajectoryMoment } from '@/models/ValueClustering';
import { safeJsonParse } from '@/utils/jsonParser';

type DimensionValues = {
    name: string;
    values: string[];
};

export async function extractDimensionValues(input: ExtractDimensionValuesInputType): Promise<ExtractDimensionValuesOutputType> {

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

    console.log("Extract dimension values raw result:", text);

    const rawResults = safeJsonParse<DimensionValues[]>(text, 'dimensionValues') ?? [];
    const valuesByName = new Map(rawResults.map((result) => [result.name, result.values]));

    const outputDimensions: Dimension[] = dimensions.map((dimension) => ({
        id: randomUUID(),
        name: dimension.name,
        description: dimension.description,
        values: valuesByName.get(dimension.name) ?? [],
    }));

    const valueClusterings: ValueClustering[] = outputDimensions.map((dimension) => ({
        dimensionIds: [dimension.id],
        valueMapping: Object.fromEntries(
            dimension.values.map((value): [string, TrajectoryMoment[]] => [value, []]),
        ),
    }));

    return {
        dimensions: outputDimensions,
        valueClusterings
    };

    } catch (error) {
        console.error('Error in extracting dimension values:', error);

        return {
            dimensions: [],
            valueClusterings: []
        };

    }
}
