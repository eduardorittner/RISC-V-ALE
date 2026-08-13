import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("Automated Zip Lab Runner Integration (code_test.html)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tests/code_test.html");
  });

  test("Suite 3.4: Automated Zip Lab Runner Integration", async ({ page }) => {
    const fixturePassPath = path.resolve(process.cwd(), "tests/fixtures/lab_submission_pass.zip");
    expect(fs.existsSync(fixturePassPath)).toBe(true);

    // Set simulator iframe URL to index.html and short timeouts for test speed
    await page.fill("#activity_url", "../index.html");
    await page.fill("#load_time", "100");
    await page.fill("#test_timeout", "2000");

    // 1. Upload lab_submission_pass.zip fixture via #file_input
    const fileInput = page.locator("#file_input");
    await fileInput.setInputFiles(fixturePassPath);

    // Wait for zip entries to be unpacked into window.files array
    await page.waitForFunction(() => window.files && window.files.length > 0, { timeout: 5000 });

    // 2. Start posting finish_test message periodically to simulate assistant finishing grading
    await page.evaluate(() => {
      window.testFinishInterval = setInterval(() => {
        window.postMessage(
          { finish_test: true, grade: 100, comment: "Pass: All assertions succeeded" },
          "*"
        );
      }, 50);
    });

    // 3. Trigger batch test runner
    await page.click("button:has-text('Run Tests')");

    // 4. Wait for test result log entry in localStorage
    await page.waitForFunction(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const item = localStorage.getItem(key);
        if (item && item.includes('"grade":100')) {
          return true;
        }
      }
      return false;
    }, { timeout: 8000 });

    // Clear test interval
    await page.evaluate(() => {
      if (window.testFinishInterval) clearInterval(window.testFinishInterval);
    });

    // 5. Extract test results from localStorage and assert grade = 100 and comment = Pass
    const resultsJson = await page.evaluate(() => {
      const list = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const str = localStorage.getItem(key);
        if (str && str !== "") {
          try {
            const parsed = JSON.parse(str);
            if (parsed && typeof parsed.grade !== "undefined") {
              list.push(parsed);
            }
          } catch (e) {}
        }
      }
      return list;
    });

    expect(resultsJson.length).toBeGreaterThan(0);
    expect(resultsJson[0].grade).toBe(100);
    expect(resultsJson[0].comment).toContain("Pass");
  });
});
