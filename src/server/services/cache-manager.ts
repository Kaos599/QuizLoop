import { getServerConfig } from "../config";
import { getGeminiClient } from "../agents/gemini-client";

export const CACHE_MIN_TOKEN_THRESHOLD = 10000;
export const CACHE_DEFAULT_TTL = "600s";

export async function getOrCreateDocumentCache(
  sessionId: string,
  fileUri: string,
  mimeType = "application/pdf",
  modelName?: string,
  customClient?: any
): Promise<string | null> {
  const config = getServerConfig();
  const targetModel = modelName || config.geminiModelName;
  const client = customClient || getGeminiClient();

  const contents = [
    {
      role: "user",
      parts: [
        {
          fileData: {
            fileUri,
            mimeType,
          },
        },
      ],
    },
  ];

  try {
    // 1. Count Tokens
    const tokenCountResp = await client.models.countTokens({
      model: targetModel,
      contents,
    });
    const totalTokens = tokenCountResp?.totalTokens ?? tokenCountResp?.total_tokens ?? 0;

    if (totalTokens < CACHE_MIN_TOKEN_THRESHOLD) {
      return null;
    }

    // 2. Create Explicit Gemini Context Cache
    const cache = await client.caches.create({
      model: targetModel,
      config: {
        contents,
        displayName: `quizloop-session-${sessionId}`,
        ttl: CACHE_DEFAULT_TTL,
      },
    });

    return cache?.name || null;
  } catch (err) {
    console.warn("Context caching creation skipped/failed:", err);
    return null;
  }
}

export async function releaseDocumentCache(
  cacheName?: string | null,
  customClient?: any
): Promise<void> {
  if (!cacheName) return;

  const client = customClient || getGeminiClient();
  try {
    await client.caches.delete({ name: cacheName });
  } catch (err) {
    console.warn(`Non-critical: failed to delete cache ${cacheName}:`, err);
  }
}
