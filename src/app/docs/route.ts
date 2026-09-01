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
  metaData: {
    title: "QuizLoop API Reference",
    description: "Interactive API Documentation & Testing Console for QuizLoop",
  },
};

export const GET = ApiReference(config);
