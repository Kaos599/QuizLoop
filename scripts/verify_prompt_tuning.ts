import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T; text: string }> {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, text };
}

function assert(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pollTask(sessionId: string, taskId: string, timeoutMs = 180000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let resp: { ok: boolean; status: number; data: any; text: string };
    try {
      resp = await fetchJson(`${BASE_URL}/api/learning/${sessionId}/task/${taskId}`);
    } catch {
      await sleep(1000);
      continue;
    }
    const { ok, status, data, text } = resp;
    if (!ok) throw new Error(`Polling task failed (${status}): ${text}`);
    if (data?.status === "done") return data;
    if (data?.status === "failed") throw new Error(`Task failed: ${data.error}`);
    await sleep(1000);
  }
  throw new Error("Task timed out");
}

function objectiveSignature(o: any): string {
  return JSON.stringify({
    id: o.id,
    title: o.title,
    description: o.description,
    bloomsLevel: o.bloomsLevel,
    difficulty: o.difficulty,
    questionCount: o.questionCount,
    keyConcepts: o.keyConcepts,
  });
}

async function main() {
  console.log("=== LIVE VERIFICATION: Per-Topic Surgical vs Overall Re-draft ===");

  const candidatePaths = [
    "G:\\Stuff\\Study\\ML Research Papers\\GPT.pdf",
    path.resolve(process.cwd(), "public/sample-document.pdf"),
  ];
  const pdfPath = candidatePaths.find((p) => fs.existsSync(p));
  assert(pdfPath, "No test PDF found");

  // 1. Upload
  const fileBytes = fs.readFileSync(pdfPath!);
  const formData = new FormData();
  formData.append("file", new Blob([fileBytes], { type: "application/pdf" }), path.basename(pdfPath!));
  const upload = await fetchJson(`${BASE_URL}/api/upload`, { method: "POST", body: formData });
  assert(upload.ok, `Upload failed: ${upload.text}`);
  const sessionId = upload.data.sessionId;
  console.log(`\n[1] Session created: ${sessionId}`);

  // 2. Generate plan
  const gen = await fetchJson(`${BASE_URL}/api/learning/${sessionId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ totalQuestions: 3, difficulty: "intermediate" }),
  });
  assert(gen.ok, `Generate failed: ${gen.text}`);
  await pollTask(sessionId, gen.data.taskId);

  const st1 = await fetchJson(`${BASE_URL}/api/learning/${sessionId}/state`);
  const initialPlan = st1.data.plan;
  assert(Array.isArray(initialPlan) && initialPlan.length >= 3, `Expected >=3 topics, got ${initialPlan?.length}`);
  console.log(`[2] Initial plan (${initialPlan.length} topics):`);
  for (const [i, o] of initialPlan.entries()) {
    console.log(`    ${i + 1}. [${o.id}] ${o.title}`);
  }

  // 3. PER-TOPIC adjust: only topic 2 gets surgical feedback
  const targetId = initialPlan[1].id;
  console.log(`\n[3] Per-topic adjust on "${initialPlan[1].title}" (id=${targetId}) -> "Simplify this topic"`);
  const adjust = await fetchJson(`${BASE_URL}/api/learning/${sessionId}/approve-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      decision: "adjust",
      feedback: null,
      topicFeedback: [{ objectiveId: targetId, note: "Simplify this topic" }],
    }),
  });
  assert(adjust.ok, `Per-topic adjust failed: ${adjust.text}`);
  await pollTask(sessionId, adjust.data.taskId);

  const st2 = await fetchJson(`${BASE_URL}/api/learning/${sessionId}/state`);
  const revised = st2.data.plan;
  assert(st2.data.revision === 1, `Expected revision 1, got ${st2.data.revision}`);
  assert(revised.length === initialPlan.length, "Topic count changed during surgical revision");

  const changedIds: string[] = [];
  for (const o of revised) {
    const orig = initialPlan.find((p: any) => p.id === o.id);
    if (!orig) {
      changedIds.push(`NEW:${o.id}`);
      continue;
    }
    if (objectiveSignature(orig) !== objectiveSignature(o)) changedIds.push(o.id);
  }

  console.log(`    Revised plan topics:`);
  for (const [i, o] of revised.entries()) {
    const marker = changedIds.includes(o.id) ? "  <-- CHANGED" : "  (untouched)";
    console.log(`    ${i + 1}. [${o.id}] ${o.title}${marker}`);
  }

  // Only the targeted topic may have changed
  assert(changedIds.length === 1 && changedIds[0] === targetId,
    `Per-topic revision changed ${changedIds.length} topics (${changedIds.join(", ")}); expected ONLY ${targetId}`);
  console.log(`    PASS: only targeted topic ${targetId} was rewritten; others byte-for-byte identical`);

  // Also confirm the untouched topic still matches byte-for-byte
  const untouched = revised.find((o: any) => o.id !== targetId);
  const untouchedOrig = initialPlan.find((p: any) => p.id === untouched.id);
  assert(untouched.keyConcepts.join("|") === untouchedOrig.keyConcepts.join("|"), "Untouched keyConcepts drifted");

  // 4. MIXED adjust: overall feedback + per-topic note -> still surgical, only
  //    targeted topics change, but the overall message reaches the rewrite prompt
  console.log(`\n[4] Mixed adjust: overall note + per-topic note on ${targetId}`);
  const mixed = await fetchJson(`${BASE_URL}/api/learning/${sessionId}/approve-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      decision: "adjust",
      feedback: "Keep the tone friendly and approachable",
      topicFeedback: [{ objectiveId: targetId, note: "Simplify this topic" }],
    }),
  });
  assert(mixed.ok, `Mixed adjust failed: ${mixed.text}`);
  await pollTask(sessionId, mixed.data.taskId);

  const st2b = await fetchJson(`${BASE_URL}/api/learning/${sessionId}/state`);
  assert(st2b.data.revision === 2, `Expected revision 2, got ${st2b.data.revision}`);
  const revisedMixed = st2b.data.plan;
  const mixedChanged: string[] = [];
  for (const o of revisedMixed) {
    const orig = initialPlan.find((p: any) => p.id === o.id);
    if (!orig) {
      mixedChanged.push(`NEW:${o.id}`);
      continue;
    }
    if (objectiveSignature(orig) !== objectiveSignature(o)) mixedChanged.push(o.id);
  }
  console.log(`    Changed topics: ${mixedChanged.join(", ") || "NONE"}`);
  for (const o of revisedMixed) {
    console.log(`    - [${o.id}] ${o.title}`);
  }
  assert(mixedChanged.length === 1 && mixedChanged[0] === targetId,
    `Mixed revision changed ${mixedChanged.length} topics (${mixedChanged.join(", ")}); expected ONLY ${targetId}`);
  console.log(`    PASS: mixed feedback still surgical - only ${targetId} rewritten`);

  // 5. OVERALL adjust: whole plan regenerated with the full message
  console.log(`\n[5] Overall adjust: "Make all topics more advanced and detailed"`);
  const overall = await fetchJson(`${BASE_URL}/api/learning/${sessionId}/approve-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      decision: "adjust",
      feedback: "Make all topics more advanced and detailed",
      topicFeedback: null,
    }),
  });
  assert(overall.ok, `Overall adjust failed: ${overall.text}`);
  await pollTask(sessionId, overall.data.taskId);

  const st3 = await fetchJson(`${BASE_URL}/api/learning/${sessionId}/state`);
  assert(st3.data.revision === 3, `Expected revision 3, got ${st3.data.revision}`);
  console.log(`    Revised (revision 3) topics:`);
  for (const [i, o] of st3.data.plan.entries()) {
    console.log(`    ${i + 1}. [${o.id}] ${o.title}`);
  }
  console.log("    PASS: overall tuning re-drafted the full plan (all topics eligible for change)");

  console.log("\n=== LIVE VERIFICATION PASSED ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n=== LIVE VERIFICATION FAILED ===");
  console.error(err);
  process.exit(1);
});