import { ExtractDimensionInputType, ExtractDimensionOutputType } from '../types';
import { callAnthropicAPI } from '../LLM';
import { getPrompt, getSystemPrompt } from './prompt';
import { Dimension } from '@/models/Dimension';

export async function extractDimension(input: ExtractDimensionInputType): Promise<ExtractDimensionOutputType> {

    try {
    
    const {trajectories, numDimensions = 3} = input

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
                    numDimensions
                }),
              },
            ],
          },
        ]
      );
    
    const dimensions = JSON.parse(text) as Dimension[];

    return {
        dimensions,
        valueClusterings: []
    };

    } catch (error) {
        console.error('Error in extracting dimension:', error);

        return {
            dimensions: [], 
            valueClusterings: []
        };

    }
}