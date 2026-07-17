import { pipeline } from '@xenova/transformers';

let extractor: any = null;

/**
 * Singleton function to load the local transformer model.
 * The model will be downloaded automatically (approx 90MB) on the first run,
 * and then cached locally.
 */
async function getExtractor() {
  if (extractor) return extractor;
  
  console.log('[Embedding] Loading Xenova/all-MiniLM-L6-v2 local model into memory...');
  extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    // defaults are fine
  });
  console.log('[Embedding] Model loaded successfully.');
  
  return extractor;
}

/**
 * Generate a 384-dimensional vector embedding for the given text.
 * Runs 100% locally and offline.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim() === '') {
    return new Array(384).fill(0);
  }

  try {
    const ext = await getExtractor();
    
    // Generate the embedding vector
    const output = await ext(text, { pooling: 'mean', normalize: true });
    
    // Output is a Float32Array, convert it to a regular number array for Prisma/pgvector
    return Array.from(output.data);
  } catch (error) {
    console.error('[Embedding] Error generating vector:', error);
    return new Array(384).fill(0);
  }
}
