import { randomUUID } from 'crypto';
import { ExtractDimensionInputType, ExtractDimensionOutputType } from '../types';
import { callLLM, LLMAuthError } from '../LLM';
import { getPrompt, getSystemPrompt } from './prompt';
import { Dimension } from '@/models/Dimension';
import { safeJsonParse } from '@/utils/jsonParser';

export async function extractDimension(input: ExtractDimensionInputType): Promise<ExtractDimensionOutputType> {

    try {

    const {trajectories, numDimensions = 3, domainDescription, existingDimensions, llmCredentials} = input

    const text = await callLLM(
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
                    domainDescription,
                    existingDimensions
                }),
              },
            ],
          },
        ],
        {},
        llmCredentials,
      );

    console.log("Extract dimension raw result:", text);

    const rawDimensions = safeJsonParse<Dimension[]>(text, 'dimensions') ?? [];
    const dimensions: Dimension[] = rawDimensions.map((dimension) => ({
        ...dimension,
        id: randomUUID(),
    }));

    return {
        dimensions
    };

    } catch (error) {
        if (error instanceof LLMAuthError) throw error;

        console.error('Error in extracting dimension:', error);

        return {
            dimensions: []
        };

    }
}