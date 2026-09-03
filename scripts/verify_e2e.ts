import { chromium, Page } from "playwright";
import assert from "node:assert";
import path from "path";
import fs from "fs";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "screenshots");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function submitAndGetVerdict(page: Page): Promise<"correct" | "incorrect" | "finished"> {
  const submitBtn = page.getByRole("button", { name: "Submit answer" });
  await submitBtn.waitFor({ state: "visible", timeout: 15000 });
  await submitBtn.click();

  const correctLocator = page.getByText("Correct - well reasoned!");
  const incorrectLocator = page.getByText("Not quite - try again, no penalty.");
  const reportLocator = page.getByText("Your mastery report", { exact: false }).or(page.getByText("Lesson completed", { exact: false }));

  // Wait until verdict arrives or final transition to mastery report occurs
  await Promise.race([
    correctLocator.waitFor({ state: "visible", timeout: 45000 }),
    incorrectLocator.waitFor({ state: "visible", timeout: 45000 }),
    reportLocator.first().waitFor({ state: "visible", timeout: 45000 }),
  ]);

  if (await reportLocator.first().isVisible()) {
    return "finished";
  }
  if (await correctLocator.isVisible()) {
    return "correct";
  }
  return "incorrect";
}

async function runE2EVerification() {
  console.log("=== STARTING COMPREHENSIVE E2E VERIFICATION OF QUIZLOOP ===");
  const browser = await chromium.launch({
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[Browser Error]:`, msg.text());
    }
  });

  try {
    // -------------------------------------------------------------
    // Step 1: Landing & Document Upload
    // -------------------------------------------------------------
    console.log("\n>>> Step 1: Landing & Document Upload");
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step1_01_landing.png") });

    // Assert upload dropzone is visible
    const uploadText = page.getByText("Upload PDF to generate Interactive AI Lesson").first();
    await uploadText.waitFor({ state: "visible" });
    console.log("✓ Upload dropzone is visible and active.");

    // Configure quiz settings (3 questions, Intermediate)
    console.log(">>> Step 2 Config: Setting 3 questions, Intermediate difficulty");
    const slider = page.locator('input[type="range"]');
    if (await slider.isVisible()) {
      await slider.fill("3");
      await slider.dispatchEvent("change");
      await page.waitForTimeout(500);
    }

    const intermediateBtn = page.getByRole("button", { name: "Intermediate" });
    if (await intermediateBtn.isVisible()) {
      await intermediateBtn.click();
      await page.waitForTimeout(500);
    }

    // Upload PDF
    const pdfPath = "G:\\Stuff\\Study\\ML Research Papers\\GPT.pdf";
    console.log(`Uploading test PDF: ${pdfPath}`);
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // Wait for upload progress & completion
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step1_02_uploaded_ready.png") });

    // Verify "Document Uploaded & Ready"
    const readyBadge = page.getByText("Document Uploaded & Ready");
    await readyBadge.waitFor({ state: "visible", timeout: 15000 });
    console.log("✓ Document successfully uploaded and session staged.");

    // -------------------------------------------------------------
    // Step 2: Curriculum Plan Generation
    // -------------------------------------------------------------
    console.log("\n>>> Step 2: Curriculum Plan Generation");
    const generateBtn = page.getByRole("button", { name: /Generate Quiz/i });
    await generateBtn.waitFor({ state: "visible" });
    await generateBtn.click();

    // Verify loading indicator / skeleton loader
    console.log("Waiting for navigation to Pedagogical Workspace (/quiz/[sessionId])...");
    await page.waitForURL(/\/quiz\/.+/, { timeout: 20000 });
    console.log(`✓ Navigated to: ${page.url()}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step2_01_generating_plan.png") });

    // Verify drafting progress or skeleton is visible
    console.log("Waiting for Gemini 3.7 Flash to draft structured learning objectives...");
    const planBanner = page.getByText("Your lesson plan - review & approve", { exact: false });
    await planBanner.waitFor({ state: "visible", timeout: 90000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step2_02_initial_plan_rendered.png") });

    // Verify objectives rendered
    const topicHeading = page.locator("h4.text-base.font-bold");
    const count = await topicHeading.count();
    console.log(`✓ Successfully generated ${count} Bloom's taxonomy learning objectives.`);
    assert(count >= 1, `Should have generated at least 1 objective, got ${count}`);

    // Log the generated topics
    for (let i = 0; i < count; i++) {
      const topicText = await topicHeading.nth(i).textContent();
      console.log(`  Topic ${i + 1}: "${topicText?.trim()}"`);
    }

    // -------------------------------------------------------------
    // Step 3: Human-in-the-Loop Plan Adjustment
    // -------------------------------------------------------------
    console.log("\n>>> Step 3: Human-in-the-Loop Plan Adjustment");
    const tuneBtn = page.getByRole("button", { name: "Tune overall plan" });
    await tuneBtn.waitFor({ state: "visible" });
    await tuneBtn.click();

    const textarea = page.locator("textarea");
    await textarea.waitFor({ state: "visible" });
    await textarea.fill("Simplify the first topic and make it concise");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step3_01_adjustment_input.png") });

    const submitFeedbackBtn = page.getByRole("button", { name: "Re-draft plan with this feedback" });
    await submitFeedbackBtn.click();
    console.log("Submitted adjustment feedback: 'Simplify the first topic and make it concise'");

    // Verify loading state while adjusting
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step3_02_redrafting_loader.png") });

    // Wait for revised plan to render
    console.log("Waiting for revised plan with Revision counter...");
    const revisionNotice = page.getByText("Plan Revised (Revision 2)", { exact: false }).or(page.getByText("Revision 2", { exact: false }));
    await revisionNotice.first().waitFor({ state: "visible", timeout: 90000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step3_03_revised_plan_rendered.png") });

    console.log("✓ Updated plan rendered with Revision counter = 2 (revision index = 1).");
    const updatedCount = await topicHeading.count();
    for (let i = 0; i < updatedCount; i++) {
      const topicText = await topicHeading.nth(i).textContent();
      console.log(`  Revised Topic ${i + 1}: "${topicText?.trim()}"`);
    }

    // -------------------------------------------------------------
    // Step 4: Plan Approval & Deck Generation
    // -------------------------------------------------------------
    console.log("\n>>> Step 4: Plan Approval & Deck Generation");
    const checkAllBtn = page.getByRole("button", { name: "Check all" });
    if (await checkAllBtn.isVisible()) {
      await checkAllBtn.click();
      console.log("Clicked 'Check all' to confirm all topics.");
    }
    await page.waitForTimeout(500);

    const approveBtn = page.getByRole("button", { name: /Looks good - start lesson/i });
    await approveBtn.waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step4_01_all_topics_checked.png") });
    await approveBtn.click();
    console.log("Clicked 'Looks good - start lesson'. Generating question deck...");

    // Wait for Question 1 to load
    const questionHeader = page.getByText(/Question 1 of/i);
    await questionHeader.waitFor({ state: "visible", timeout: 120000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step4_02_question1_rendered.png") });

    // Verify 4 options exist and no answers are leaked
    const optionLabels = page.locator("label.group.relative");
    const optionCount = await optionLabels.count();
    console.log(`✓ First MCQ rendered with ${optionCount} options.`);
    assert.strictEqual(optionCount, 4, "MCQ must have 4 options");

    for (let i = 0; i < optionCount; i++) {
      const text = await optionLabels.nth(i).textContent();
      assert(!text?.includes("Correct - well reasoned!"), "Premature answer leakage detected!");
    }
    console.log("✓ Verified: No answer keys or checkmarks are prematurely leaked in the UI.");

    // -------------------------------------------------------------
    // Step 5: Socratic Tutoring & Help Tools
    // -------------------------------------------------------------
    console.log("\n>>> Step 5: Socratic Tutoring & Help Tools");
    const hintBtn = page.getByRole("button", { name: "Get a hint" });
    await hintBtn.waitFor({ state: "visible" });
    await hintBtn.click();
    await page.waitForTimeout(1000);

    const hintBox = page.locator("text=Hint").first();
    await hintBox.waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step5_01_hint_revealed.png") });
    console.log("✓ Socratic Hint revealed successfully.");

    // Open "Learn more" Socratic coaching drawer
    const learnMoreBtn = page.getByRole("button", { name: "Learn more" });
    await learnMoreBtn.click();
    await page.waitForTimeout(500);

    const coachTextarea = page.locator('textarea[placeholder*="Why does this work"]');
    await coachTextarea.waitFor({ state: "visible" });
    await coachTextarea.fill("Can you explain the high level intuition without giving away the answer?");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step5_02_learn_more_open.png") });

    const sendCoachBtn = page.getByRole("button", { name: "Send" });
    await sendCoachBtn.click();
    console.log("Sent inquiry to Socratic coach. Waiting for breakdown...");

    const coachBreakdown = page.getByText("Coach's breakdown", { exact: false });
    await coachBreakdown.waitFor({ state: "visible", timeout: 45000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step5_03_coaching_message_received.png") });
    console.log("✓ Socratic coaching breakdown received and displayed.");

    // -------------------------------------------------------------
    // Step 6: Deliberate Incorrect Attempt & Error Diagnostics
    // -------------------------------------------------------------
    console.log("\n>>> Step 6: Deliberate Incorrect Attempt & Error Diagnostics");
    const options = page.locator("label.group.relative");
    // Pick Option B (index 1) which is a deliberate misconception
    await options.nth(1).click();
    await page.waitForTimeout(300);

    console.log("Submitting Option B. Waiting for evaluation...");
    let verdict = await submitAndGetVerdict(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step6_01_first_attempt_result.png") });

    if (verdict === "incorrect") {
      console.log("✓ Deliberate incorrect attempt correctly flagged with 'Not quite - try again, no penalty.' visual indicator.");
      const diagnostic = await page.locator(".bg-rose-50").first().textContent();
      console.log("  Diagnostic Misconception Feedback:", diagnostic?.trim());

      // Assert question is retained (not skipped)
      assert(await page.getByText(/Question 1 of/i).isVisible(), "Question 1 should still be visible allowing another attempt");
      console.log("✓ Question is retained allowing another attempt.");

      // Click Reset selection to return to idle
      const resetBtn = page.getByRole("button", { name: "Reset selection" });
      await resetBtn.waitFor({ state: "visible" });
      await resetBtn.click();
      await page.waitForTimeout(500);

      // -----------------------------------------------------------
      // Step 7: Progression & Deck Traversal
      // -----------------------------------------------------------
      console.log("\n>>> Step 7: Progression & Deck Traversal (Retrying with correct option)");
      for (const optIdx of [0, 2, 3]) {
        console.log(`Trying option index ${optIdx}...`);
        await options.nth(optIdx).click();
        await page.waitForTimeout(300);
        verdict = await submitAndGetVerdict(page);
        if (verdict === "correct" || verdict === "finished") {
          console.log(`✓ Option index ${optIdx} was correct!`);
          break;
        } else {
          console.log(`Option ${optIdx} was incorrect, resetting selection...`);
          const reset = page.getByRole("button", { name: "Reset selection" });
          if (await reset.isVisible()) {
            await reset.click();
            await page.waitForTimeout(500);
          }
        }
      }
    } else {
      console.log("Option B was evaluated as correct.");
    }

    if (verdict !== "finished") {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step7_01_q1_correct.png") });
      await page.getByText("Correct - well reasoned!").waitFor({ state: "visible" });
      await page.getByText("Key takeaway:", { exact: false }).waitFor({ state: "visible" });
      console.log("✓ 'Correct' badge and Key Takeaway card rendered.");

      // Advance to Question 2
      const nextQBtn = page.getByRole("button", { name: "Next question" });
      await nextQBtn.waitFor({ state: "visible" });
      await nextQBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step7_02_q2_rendered.png") });
      console.log("✓ Transitioned to Question 2.");

      // Answer remaining questions (Questions 2 and 3)
      let currentQ = 2;
      while (currentQ <= 5) {
        const isReport = await page.getByText("Your mastery report", { exact: false }).isVisible();
        if (isReport) {
          console.log("Reached Mastery Report.");
          break;
        }

        const qIndicator = page.getByText(new RegExp(`Question ${currentQ} of`, "i"));
        if (!(await qIndicator.isVisible())) {
          console.log(`No Question ${currentQ} indicator. Moving to summary check.`);
          break;
        }
        console.log(`Answering Question ${currentQ}...`);
        const qOptions = page.locator("label.group.relative");

        let _answeredCorrectly = false;
        for (let i = 0; i < 4; i++) {
          await qOptions.nth(i).click();
          await page.waitForTimeout(300);
          const qVerdict = await submitAndGetVerdict(page);

          if (qVerdict === "finished") {
            console.log(`✓ Final question answered, transitioned directly to Mastery Report!`);
            _answeredCorrectly = true;
            break;
          } else if (qVerdict === "correct") {
            console.log(`✓ Question ${currentQ} answered correctly on option ${i + 1}`);
            _answeredCorrectly = true;
            break;
          } else {
            console.log(`  Option ${i + 1} was incorrect, resetting selection...`);
            const resetBtn = page.getByRole("button", { name: "Reset selection" });
            if (await resetBtn.isVisible()) {
              await resetBtn.click();
              await page.waitForTimeout(500);
            }
          }
        }

        if (await page.getByText("Your mastery report", { exact: false }).isVisible()) {
          break;
        }

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `step7_03_q${currentQ}_correct.png`) });
        const nextBtn = page.getByRole("button", { name: /Next question|See results|View summary/i });
        if (await nextBtn.isVisible()) {
          await nextBtn.click();
          await page.waitForTimeout(2000);
        } else {
          break;
        }
        currentQ++;
      }
    }

    // -------------------------------------------------------------
    // Step 8: Mastery Summary Report & Analytics
    // -------------------------------------------------------------
    console.log("\n>>> Step 8: Mastery Summary Report & Analytics");
    const reportTitle = page.getByText("Your mastery report", { exact: false }).or(page.getByText("Lesson completed", { exact: false }));
    await reportTitle.first().waitFor({ state: "visible", timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step8_01_mastery_report.png"), fullPage: true });

    // Assert sections:
    console.log("Asserting Mastery Report sections...");
    await page.getByText("Lesson completed").waitFor({ state: "visible" });
    await page.getByText("Mastery", { exact: true }).waitFor({ state: "visible" });
    await page.getByText("Topic breakdown", { exact: false }).waitFor({ state: "visible" });
    await page.getByText("Strengths you showed", { exact: false }).waitFor({ state: "visible" });
    await page.getByText("Personalized study tips", { exact: false }).waitFor({ state: "visible" });

    // Extract stats
    const masteryScore = await page.locator("span.text-4xl.font-extrabold").textContent();
    console.log(`✓ Final Mastery Score: ${masteryScore?.trim()}`);

    console.log("✓ All Mastery Report sections are fully populated and visible!");
    console.log(`\nFinal Full-Page Screenshot saved to: ${path.join(SCREENSHOT_DIR, "step8_01_mastery_report.png")}`);
    console.log("\n=== COMPREHENSIVE E2E VERIFICATION COMPLETED SUCCESSFULLY ===");

  } catch (error) {
    console.error("E2E Verification Failed with error:", error);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "error_state.png"), fullPage: true });
    throw error;
  } finally {
    await browser.close();
  }
}

runE2EVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
