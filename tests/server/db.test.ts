// @vitest-environment node
import { describe, it, expect } from "vitest";
import pg from "pg";
import "@/server/db";

describe("pg BIGINT (OID 20) type parser", () => {
  it("maps BIGINT strings to JS numbers for token telemetry", () => {
    const parser = pg.types.getTypeParser(20);
    expect(typeof parser).toBe("function");
    expect(parser("12345")).toBe(12345);
    expect(parser("0")).toBe(0);
  });
});