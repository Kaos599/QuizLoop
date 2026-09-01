import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pg",
    "@langchain/langgraph-checkpoint-postgres",
  ],
};

export default nextConfig;
