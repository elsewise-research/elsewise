import { ExtractDimensionInputType, ExtractDimensionOutputType } from '../types';
import { withLLMApi } from '../LLM';
import { extractDimension } from './response';

export async function POST(request: Request) {
  const body = await request.json();
  return withLLMApi<ExtractDimensionInputType, ExtractDimensionOutputType>(extractDimension, 'dimension/extract')(
    body,
    request,
  );
}