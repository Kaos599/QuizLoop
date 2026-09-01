import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PedagogicalWorkspace } from "./pedagogical-workspace";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode; [k: string]: unknown }) => (
    <a {...props}>{children}</a>
  ),
}));

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(data),
    json: async () => data,
  } as Response;
}

const REVIEW_STATE = {
  session_id: "sess-1",
  status: "planning",
  plan_status: "review",
  revision: 0,
  plan_cap_reached: false,
  quiz_config: { total_questions: 3, difficulty: "auto" },
  plan: [
    {
      id: "obj-1",
      title: "Model Architecture",
      description: "Understand the architecture.",
      blooms_level: "Apply",
      difficulty: "Intermediate",
      question_count: 2,
      status: "pending",
    },
  ],
  current_mcq: null,
  slots: null,
  attempts: [],
};

describe("PedagogicalWorkspace plan approval flow", () => {
  const user = userEvent.setup();

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("clears the approving flag when the approve POST fails so the UI is not stuck loading", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/state")) return jsonResponse(REVIEW_STATE);
      if (url.includes("/approve-plan")) {
        throw new TypeError("Failed to fetch");
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PedagogicalWorkspace sessionId="sess-1" />);

    await screen.findByText("Your lesson plan - review & approve");
    await user.click(screen.getByRole("button", { name: /check all/i }));
    await user.click(screen.getByRole("button", { name: /looks good - start lesson/i }));

    // POST fails -> error surfaced, and the loading screen must NOT persist.
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText("Generating your questions…")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /review all topics to start|looks good - start lesson/i }),
    ).toBeInTheDocument();
  });

  it("clears the adjusting flag when the reject-all POST fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/state")) return jsonResponse(REVIEW_STATE);
      if (url.includes("/approve-plan")) {
        throw new TypeError("Failed to fetch");
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PedagogicalWorkspace sessionId="sess-1" />);

    await screen.findByText("Your lesson plan - review & approve");
    await user.click(screen.getByRole("button", { name: /start over/i }));

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText("Re-drafting your learning roadmap…")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /review all topics to start|looks good - start lesson/i }),
    ).toBeInTheDocument();
  });
});