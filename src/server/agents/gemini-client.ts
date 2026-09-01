import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getServerConfig } from "../config";
import { execute } from "../db";

let _clientInstance: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (_clientInstance) {
    return _clientInstance;
  }

  const config = getServerConfig();

  if (config.googleCloudProject && !config.geminiApiKey) {
    _clientInstance = new GoogleGenAI({
      vertexai: true,
      project: config.googleCloudProject,
      location: config.googleCloudLocation,
    });
    return _clientInstance;
  }

  if (config.geminiApiKey) {
    _clientInstance = new GoogleGenAI({ apiKey: config.geminiApiKey });
    return _clientInstance;
  }

  throw new Error("Neither Vertex AI nor GEMINI_API_KEY is available to initialize Gemini Client.");
}

export function setGeminiClientForTesting(client: GoogleGenAI | null): void {
  _clientInstance = client;
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

function isRetryableError(err: any): boolean {
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  if (status === 429 || status === 503) {
    return true;
  }
  return false;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const targetModel = modelName || config.geminiModelName;
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
  let response: any = null;
  let attempts = 0;
  const maxAttempts = 4;
  let baseDelay = 1000;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      response = await client.models.generateContent({
        model: targetModel,
        contents: contents as any,
        config: reqConfig,
      });
      break;
    } catch (err: any) {
      if (attempts < maxAttempts && isRetryableError(err)) {
        const jitter = Math.random() * 200;
        const sleepMs = baseDelay + jitter;
        baseDelay *= 2;
        console.warn(`Gemini call for node '${nodeName}' hit status 429/503. Retrying in ${Math.round(sleepMs)}ms...`);
        await delay(sleepMs);
        continue;
      }
      throw err;
    }
  }

  const durationMs = Date.now() - startTime;

  // Extract Token Telemetry (camelCase from JS SDK)
  const usage = response?.usageMetadata;
  const promptTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  const totalTokens = usage?.totalTokenCount ?? (promptTokens + outputTokens);
  let thoughtTokens = 0;

  if (usage?.candidatesTokensDetails && usage.candidatesTokensDetails.length > 0) {
    thoughtTokens = usage.candidatesTokensDetails[0].thoughtTokenCount ?? 0;
  }

  let text = response?.text || "";
  if (!text) {
    throw new Error("No text content returned from Gemini model.");
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
        [sessionId, nodeName, targetModel, promptTokens, thoughtTokens, outputTokens, totalTokens, durationMs]
      );
    } catch (dbErr) {
      console.warn("Failed to record token usage in DB:", dbErr);
    }
  }

  return text;
}
