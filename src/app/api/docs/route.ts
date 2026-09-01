import { ApiReference } from "@scalar/nextjs-api-reference";
import { openApiSpec } from "@/server/openapi";

export const runtime = "nodejs";

const config = {
  spec: {
    content: openApiSpec,
  },
  theme: "purple" as const,
  layout: "modern" as const,
  showSidebar: true,
  pageTitle: "QuizLoop API Documentation",
};

export const GET = ApiReference(config);
