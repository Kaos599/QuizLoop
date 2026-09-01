// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  getOrCreateDocumentCache,
  releaseDocumentCache,
  CACHE_MIN_TOKEN_THRESHOLD,
  CACHE_DEFAULT_TTL,
} from "@/server/services/cache-manager";

describe("Cache Manager", () => {
  it("has expected configuration constants", () => {
    expect(CACHE_MIN_TOKEN_THRESHOLD).toBe(10000);
    expect(CACHE_DEFAULT_TTL).toBe("600s");
  });

  it("skips cache creation when document is under 10k tokens", async () => {
    const mockClient = {
      models: {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 4500 }),
      },
      caches: {
        create: vi.fn(),
      },
    };

    const cacheName = await getOrCreateDocumentCache(
      "test-session",
      "https://generativelanguage.googleapis.com/v1beta/files/test",
      "application/pdf",
      undefined,
      mockClient
    );

    expect(cacheName).toBeNull();
    expect(mockClient.caches.create).not.toHaveBeenCalled();
  });

  it("creates cache when document exceeds 10k tokens", async () => {
    const mockCache = {
      name: "cachedContents/quizloop-12345",
      expireTime: "2026-08-29T16:45:00Z",
    };
    const mockClient = {
      models: {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 22000 }),
      },
      caches: {
        create: vi.fn().mockResolvedValue(mockCache),
      },
    };

    const cacheName = await getOrCreateDocumentCache(
      "test-session",
      "https://generativelanguage.googleapis.com/v1beta/files/test",
      "application/pdf",
      undefined,
      mockClient
    );

    expect(cacheName).toBe("cachedContents/quizloop-12345");
    expect(mockClient.caches.create).toHaveBeenCalledTimes(1);
  });

  it("releases and deletes document cache", async () => {
    const mockClient = {
      caches: {
        delete: vi.fn().mockResolvedValue(undefined),
      },
    };

    await releaseDocumentCache("cachedContents/quizloop-12345", mockClient);
    expect(mockClient.caches.delete).toHaveBeenCalledWith({
      name: "cachedContents/quizloop-12345",
    });
  });
});
