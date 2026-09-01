import crypto from "crypto";

export const MAX_TASKS = 200;

export class TaskRecord {
  taskId: string;
  sessionId: string;
  action: string;
  status: "pending" | "running" | "done" | "failed";
  error: string | null;
  createdAt: number;
  finishedAt: number | null;

  constructor(sessionId: string, action: string) {
    this.taskId = crypto.randomBytes(6).toString("hex"); // 12 hex characters
    this.sessionId = sessionId;
    this.action = action;
    this.status = "pending";
    this.error = null;
    this.createdAt = Date.now();
    this.finishedAt = null;
  }

  get durationMs(): number | null {
    if (this.finishedAt === null) return null;
    return Math.max(0, this.finishedAt - this.createdAt);
  }

  toDict() {
    return {
      taskId: this.taskId,
      sessionId: this.sessionId,
      action: this.action,
      status: this.status,
      error: this.error,
      createdAt: this.createdAt,
      finishedAt: this.finishedAt,
      durationMs: this.durationMs,
    };
  }
}

export class TaskRegistry {
  private tasks: Map<string, TaskRecord> = new Map();

  async submit(
    sessionId: string,
    action: string,
    work: Promise<unknown> | (() => Promise<unknown>)
  ): Promise<TaskRecord> {
    // 1. In-flight deduplication: LangGraph rejects concurrent resumes of one thread
    for (const rec of this.tasks.values()) {
      if (
        rec.sessionId === sessionId &&
        rec.action === action &&
        (rec.status === "pending" || rec.status === "running")
      ) {
        return rec;
      }
    }

    // 2. Create new task record
    const record = new TaskRecord(sessionId, action);
    this.tasks.set(record.taskId, record);

    // 3. Memory bounding: evict oldest completed/failed tasks
    if (this.tasks.size > MAX_TASKS) {
      const sortedKeys = Array.from(this.tasks.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt)
        .map(([k]) => k);

      for (const key of sortedKeys) {
        const item = this.tasks.get(key);
        if (item && (item.status === "done" || item.status === "failed")) {
          this.tasks.delete(key);
        }
        if (this.tasks.size <= MAX_TASKS) break;
      }
    }

    // 4. Run asynchronously on event loop
    const promise = typeof work === "function" ? work() : work;
    void this.run(record, promise);

    return record;
  }

  private async run(record: TaskRecord, work: Promise<unknown>) {
    record.status = "running";
    try {
      await work;
      record.status = "done";
    } catch (err: unknown) {
      record.status = "failed";
      record.error = err instanceof Error ? err.message : String(err);
      console.warn(
        `Task ${record.taskId} (${record.action}) failed for session ${record.sessionId}:`,
        err
      );
    } finally {
      record.finishedAt = Date.now();
    }
  }

  get(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId);
  }

  clearForTesting(): void {
    this.tasks.clear();
  }
}

const globalForTaskRegistry = globalThis as unknown as {
  taskRegistry?: TaskRegistry;
};

export const taskRegistry =
  globalForTaskRegistry.taskRegistry ?? new TaskRegistry();

if (process.env.NODE_ENV !== "production") {
  globalForTaskRegistry.taskRegistry = taskRegistry;
}
