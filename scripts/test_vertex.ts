import { execSync } from "child_process";
import dotenv from "dotenv";
import path from "path";
import { z } from "zod";
import {
  PlanArraySchema,
} from "../src/server/schemas/pedagogical";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export function cleanJsonSchemaForVertex(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;

  if (Array.isArray(schema)) {
    return schema.map(cleanJsonSchemaForVertex);
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
      // If anyOf contains [{type: 'string'}, {type: 'null'}]
      const nonNull = value.find((v) => v && v.type !== "null");
      if (nonNull) {
        const cleaned = cleanJsonSchemaForVertex(nonNull);
        Object.assign(copy, cleaned);
        copy.nullable = true;
        continue;
      }
    }

    copy[key] = cleanJsonSchemaForVertex(value);
  }

  return copy;
}

async function test() {
  const token = execSync("gcloud auth print-access-token", { encoding: "utf-8" }).trim();
  const projectId = "gen-lang-client-0470874118";
  const location = "global";
  const model = "gemini-3.7-flash";

  console.log("Testing PlanArraySchema with cleanJsonSchemaForVertex...");
  const cleanedSchema = cleanJsonSchemaForVertex(z.toJSONSchema(PlanArraySchema));
  console.log("Cleaned Schema for PlanArraySchema:\n", JSON.stringify(cleanedSchema, null, 2));

  const url = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: "Generate 3 objectives for learning Python loops." }],
      },
    ],
    systemInstruction: {
      parts: [{ text: "You are a curriculum planner." }],
    },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: cleanedSchema,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  console.log("Status:", res.status);
  const data = await res.json();
  if (res.ok) {
    console.log("PlanArraySchema SUCCESS! Response:");
    console.log(data.candidates?.[0]?.content?.parts?.[0]?.text);
  } else {
    console.error("PlanArraySchema FAILED:", JSON.stringify(data, null, 2));
  }
}

test();
