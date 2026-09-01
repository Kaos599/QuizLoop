import { GoogleGenAI } from "@google/genai";
import { execSync } from "child_process";
import { z } from "zod";
import { getServerConfig } from "../config";
import { execute } from "../db";

const globalForGemini = globalThis as unknown as {
  _clientInstance?: GoogleGenAI | null;
  _gcloudToken?: { token: string; expiresAt: number } | null;
};

export function getGeminiClient(): GoogleGenAI {
  if (globalForGemini._clientInstance) {
    return globalForGemini._clientInstance;
  }

  const config = getServerConfig();

  if (config.googleCloudProject && !config.geminiApiKey) {
    globalForGemini._clientInstance = new GoogleGenAI({
      vertexai: true,
      project: config.googleCloudProject,
      location: config.googleCloudLocation || "global",
    });
    return globalForGemini._clientInstance;
  }

  if (config.geminiApiKey) {
    globalForGemini._clientInstance = new GoogleGenAI({ apiKey: config.geminiApiKey });
    return globalForGemini._clientInstance;
  }

  throw new Error("Neither Vertex AI nor GEMINI_API_KEY is available to initialize Gemini Client.");
}

export function setGeminiClientForTesting(client: GoogleGenAI | null): void {
  globalForGemini._clientInstance = client;
}

export interface GenerateGeminiContentOptions {
  contents: unknown[];
  systemInstruction?: string;
  thinkingBudget?: number;
  thinkingLevel?: string;
  enableGrounding?: boolean;
  responseSchema?: z.ZodTypeAny;
  sessionId?: string;
  nodeName?: string;
  modelName?: string;
  cachedContent?: string;
}

function cleanJsonSchema(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;

  if (Array.isArray(schema)) {
    return schema.map(cleanJsonSchema);
  }

  const copy: Record<string, any> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (key === "$schema" || key === "additionalProperties") {
      continue;
    }

    if (key === "type" && Array.isArray(value)) {
      // e.g. ["string", "null"] -> "string"
      const nonNullType = value.find((t) => t !== "null") || "string";
      copy[key] = nonNullType;
      copy.nullable = true;
      continue;
    }

    if (key === "anyOf" && Array.isArray(value)) {
      const nonNull = value.find((v) => v && v.type !== "null");
      if (nonNull) {
        const cleaned = cleanJsonSchema(nonNull);
        Object.assign(copy, cleaned);
        copy.nullable = true;
        continue;
      }
    }

    copy[key] = cleanJsonSchema(value);
  }

  return copy;
}

function getGcloudAccessToken(): string {
  const now = Date.now();
  if (globalForGemini._gcloudToken && globalForGemini._gcloudToken.expiresAt > now + 60000) {
    return globalForGemini._gcloudToken.token;
  }

  try {
    const token = execSync("gcloud auth print-access-token", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (token && token.length > 10) {
      globalForGemini._gcloudToken = {
        token,
        expiresAt: now + 30 * 60 * 1000, // 30 min cache
      };
      return token;
    }
  } catch (err) {
    console.warn("Could not retrieve gcloud access token via CLI:", err);
  }

  return "";
}

async function callVertexGlobal(
  options: GenerateGeminiContentOptions,
  token: string
): Promise<{ text: string; usage: any; durationMs: number; usedModel: string }> {
  const config = getServerConfig();
  const projectId = config.googleCloudProject || "gen-lang-client-0470874118";
  const location = config.googleCloudLocation || "global";
  const targetModel = options.modelName || config.geminiModelName || "gemini-3.7-flash";

  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${targetModel}:generateContent`;

  // Normalize contents to Vertex REST format
  const formattedParts: any[] = [];
  for (const item of options.contents) {
    if (typeof item === "string") {
      formattedParts.push({ text: item });
    } else if (item && typeof item === "object") {
      const obj = item as any;
      if (obj.text) {
        formattedParts.push({ text: obj.text });
      } else if (obj.inlineData) {
        formattedParts.push({ inlineData: obj.inlineData });
      } else if (obj.fileData) {
        formattedParts.push({ fileData: obj.fileData });
      } else {
        formattedParts.push({ text: JSON.stringify(obj) });
      }
    }
  }

  const payload: any = {
    contents: [
      {
        role: "user",
        parts: formattedParts,
      },
    ],
  };

  if (options.systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: options.systemInstruction }],
    };
  }

  const generationConfig: any = {
    maxOutputTokens: 16384,
  };

  if (options.responseSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = cleanJsonSchema(z.toJSONSchema(options.responseSchema));
  }

  payload.generationConfig = generationConfig;

  const startTime = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Vertex AI (model ${targetModel} in ${location}) failed with status ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  const durationMs = Date.now() - startTime;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  if (!text) {
    throw new Error("No text returned in Vertex AI response.");
  }

  return {
    text,
    usage: data.usageMetadata,
    durationMs,
    usedModel: targetModel,
  };
}

export async function generateGeminiContent(
  options: GenerateGeminiContentOptions
): Promise<string> {
  const {
    contents,
    systemInstruction,
    thinkingBudget,
    thinkingLevel,
    enableGrounding = false,
    responseSchema,
    sessionId,
    nodeName = "llm_node",
    modelName,
    cachedContent,
  } = options;

  const config = getServerConfig();
  const targetModel = modelName || config.geminiModelName || "gemini-3.7-flash";

  let text = "";
  let promptTokens = 0;
  let outputTokens = 0;
  let thoughtTokens = 0;
  let totalTokens = 0;
  let durationMs = 0;
  let usedModelName = targetModel;

  let sdkSuccess = false;

  // 1. Attempt using official SDK if standard API key is configured
  if (config.geminiApiKey && !config.geminiApiKey.startsWith("AQ.")) {
    try {
      const client = getGeminiClient();
      const tools: any[] = [];
      if (enableGrounding && !responseSchema) {
        tools.push({ googleSearch: {} });
      }

      let thinkingConfig: any = undefined;
      if (thinkingBudget !== undefined) {
        thinkingConfig = { thinkingBudget };
      } else if (thinkingLevel !== undefined) {
        thinkingConfig = { thinkingLevel };
      }

      const reqConfig: any = {
        systemInstruction,
        cachedContent,
        tools: tools.length > 0 ? tools : undefined,
        thinkingConfig,
        maxOutputTokens: 16384,
      };

      if (responseSchema) {
        reqConfig.responseMimeType = "application/json";
        reqConfig.responseSchema = z.toJSONSchema(responseSchema);
      }

      const startTime = Date.now();
      const response = await client.models.generateContent({
        model: targetModel,
        contents: contents as any,
        config: reqConfig,
      });

      durationMs = Date.now() - startTime;
      text = response?.text || "";
      const usage = response?.usageMetadata;
      promptTokens = usage?.promptTokenCount ?? 0;
      outputTokens = usage?.candidatesTokenCount ?? 0;
      totalTokens = usage?.totalTokenCount ?? promptTokens + outputTokens;

      if (usage?.candidatesTokensDetails && usage.candidatesTokensDetails.length > 0) {
        thoughtTokens = usage.candidatesTokensDetails[0].thoughtTokenCount ?? 0;
      }

      if (text) {
        sdkSuccess = true;
      }
    } catch (err: any) {
      console.warn(
        `Gemini SDK invocation for node '${nodeName}' failed (${err?.message || err}). Falling back to Vertex AI global endpoint...`
      );
    }
  }

  // 2. Vertex AI Global Endpoint Direct Execution with Google Cloud Access Token
  if (!sdkSuccess) {
    const gcloudToken = getGcloudAccessToken();
    if (!gcloudToken) {
      throw new Error(
        "Gemini API key is depleted/invalid and no Google Cloud access token could be obtained from gcloud."
      );
    }

    const vertexRes = await callVertexGlobal(options, gcloudToken);
    text = vertexRes.text;
    durationMs = vertexRes.durationMs;
    usedModelName = vertexRes.usedModel;

    const usage = vertexRes.usage;
    promptTokens = usage?.promptTokenCount ?? 0;
    outputTokens = usage?.candidatesTokenCount ?? 0;
    thoughtTokens = usage?.thoughtsTokenCount ?? 0;
    totalTokens = usage?.totalTokenCount ?? promptTokens + outputTokens;
  }

  if (!text) {
    throw new Error("No text content returned from model.");
  }

  // Strip Markdown code block wrapper if present
  if (text.startsWith("```json")) {
    text = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  } else if (text.startsWith("```")) {
    text = text.replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
  }

  // Persist Token Metrics to Database Asynchronously (Never Fatal)
  if (sessionId) {
    try {
      await execute(
        `UPDATE sessions 
         SET input_tokens = input_tokens + $1,
             output_tokens = output_tokens + $2,
             thought_tokens = thought_tokens + $3,
             total_tokens = total_tokens + $4,
             updated_at = NOW()
         WHERE id = $5::uuid`,
        [promptTokens, outputTokens, thoughtTokens, totalTokens, sessionId]
      );

      await execute(
        `INSERT INTO token_usage_logs 
         (session_id, node_name, model_name, prompt_tokens, thought_tokens, output_tokens, total_tokens, latency_ms)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)`,
        [sessionId, nodeName, usedModelName, promptTokens, thoughtTokens, outputTokens, totalTokens, durationMs]
      );
    } catch (dbErr) {
      console.warn("Failed to record token usage in DB:", dbErr);
    }
  }

  return text;
}
