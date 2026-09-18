import { ExtractDimensionValuesInputType, ExtractDimensionValuesOutputType } from '../types';
import { withLLMApi } from '../LLM';
import { extractDimensionValues } from './response';

export async function POST(request: Request) {
  const body = await request.json();
  return withLLMApi<ExtractDimensionValuesInputType, ExtractDimensionValuesOutputType>(extractDimensionValues, 'dimension/extract-values')(
    body,
    request,
  );
}
