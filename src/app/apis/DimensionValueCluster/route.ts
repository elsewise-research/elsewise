import { DimensionValueClusterInputType, DimensionValueClusterOutputType } from '../types';
import { withLLMApi } from '../LLM';
import { dimensionValueCluster } from './response';

export async function POST(request: Request) {
  const body = await request.json();
  return withLLMApi<DimensionValueClusterInputType, DimensionValueClusterOutputType>(dimensionValueCluster, 'dimension/cluster')(
    body,
    request,
  );
}