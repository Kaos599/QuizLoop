import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const RawEnvSchema = z.object({
  POSTGRES_URL: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL_NAME: z.string().default("gemini-3.7-flash"),
  GOOGLE_CLOUD_PROJECT: z.string().default(""),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().default(""),
  GOOGLE_CLOUD_LOCATION: z.string().default("global"),
  LANGSMITH_TRACING: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (typeof val === "boolean") return val;
      if (typeof val === "string") return val.toLowerCase() === "true" || val === "1";
      return false;
    }),
  LANGSMITH_API_KEY: z.string().default(""),
  LANGSMITH_PROJECT: z.string().default("quizloop-platform"),
  LANGSMITH_ENDPOINT: z.string().default("https://api.smith.langchain.com"),
  SUPABASE_URL: z.string().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),
  APP_ENV: z.string().optional(),
  NODE_ENV: z.string().optional(),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://127.0.0.1:3000")
    .transform((s) => s.split(",").map((item) => item.trim()).filter(Boolean)),
});

export interface ServerConfig {
  appEnv: string;
  postgresUrl: string;
  geminiApiKey: string;
  geminiModelName: string;
  googleCloudProject: string;
  googleApplicationCredentials: string;
  googleCloudLocation: string;
  langsmithTracing: boolean;
  langsmithApiKey: string;
  langsmithProject: string;
  langsmithEndpoint: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  corsOrigins: string[];
}

export function parseConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const parsed = RawEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Configuration validation failed: ${parsed.error.message}`);
  }

  const data = parsed.data;

  // 1. Fail-fast check for POSTGRES_URL
  const postgresUrl = data.POSTGRES_URL || env.POSTGRES_URL || env.postgres_url;
  if (!postgresUrl || postgresUrl.trim() === "") {
    throw new Error("Missing required environment variable: POSTGRES_URL");
  }

  // 2. Fail-fast check for Gemini API key / Google Cloud credentials
  const geminiApiKey = data.GEMINI_API_KEY ?? env.GEMINI_API_KEY ?? "";
  const googleAppCreds = data.GOOGLE_APPLICATION_CREDENTIALS ?? env.GOOGLE_APPLICATION_CREDENTIALS ?? "";

  if (!geminiApiKey.trim() && !googleAppCreds.trim()) {
    throw new Error(
      "Missing required Gemini configuration: either GEMINI_API_KEY or GOOGLE_APPLICATION_CREDENTIALS must be provided."
    );
  }

  const appEnv = (data.APP_ENV || env.APP_ENV || data.NODE_ENV || env.NODE_ENV || "development").trim();

  const config: ServerConfig = {
    appEnv,
    postgresUrl: postgresUrl.trim(),
    geminiApiKey: geminiApiKey.trim(),
    geminiModelName: data.GEMINI_MODEL_NAME,
    googleCloudProject: data.GOOGLE_CLOUD_PROJECT,
    googleApplicationCredentials: googleAppCreds.trim(),
    googleCloudLocation: data.GOOGLE_CLOUD_LOCATION,
    langsmithTracing: data.LANGSMITH_TRACING,
    langsmithApiKey: data.LANGSMITH_API_KEY,
    langsmithProject: data.LANGSMITH_PROJECT,
    langsmithEndpoint: data.LANGSMITH_ENDPOINT,
    supabaseUrl: data.SUPABASE_URL,
    supabaseServiceRoleKey: data.SUPABASE_SERVICE_ROLE_KEY,
    corsOrigins: data.CORS_ORIGINS,
  };

  // Seed LangSmith environment variables globally for LangChain / LangGraph tracing
  if (config.langsmithTracing && config.langsmithApiKey) {
    process.env.LANGSMITH_TRACING = "true";
    process.env.LANGSMITH_API_KEY = config.langsmithApiKey;
    process.env.LANGSMITH_PROJECT = config.langsmithProject;
    process.env.LANGSMITH_ENDPOINT = config.langsmithEndpoint;
    process.env.LANGCHAIN_TRACING_V2 = "true";
    process.env.LANGCHAIN_API_KEY = config.langsmithApiKey;
    process.env.LANGCHAIN_PROJECT = config.langsmithProject;
    process.env.LANGCHAIN_CALLBACKS_BACKGROUND = "true";
  }

  return config;
}

let _configInstance: ServerConfig | null = null;

export function getServerConfig(): ServerConfig {
  if (!_configInstance) {
    _configInstance = parseConfig(process.env);
  }
  return _configInstance;
}

export function resetServerConfigForTesting(): void {
  _configInstance = null;
}
