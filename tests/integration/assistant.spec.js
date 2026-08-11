import { test, expect } from "@playwright/test";

test.describe("Lab Assistant & Grading Engine Subsystem", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
  });

  test("Suite 3.1: Sequential Test Pipeline & UI State", async ({ page }) => {
    await page.evaluate(async () => {
      const { UI_Helper } = await import("./modules/assistant.js");

      // Reset test list element
      const testList = document.getElementById("assistant_test_list");
      if (testList) testList.innerHTML = "";

      // Instantiate UI_Helper on existing index.html elements
      window.testUIHelper = new UI_Helper("Sequential Test Pipeline");
      window.testUIHelper.sleep = () => Promise.resolve();

      // Register Test 0 (Pass)
      window.testUIHelper.add_test("Test 0: Arithmetic check", async () => true);

      // Register Test 1 (Pass)
      window.testUIHelper.add_test("Test 1: Memory load check", async () => true);

      // Register Test 2 (Fail)
      window.testUIHelper.add_test("Test 2: Register result check", async () => false);

      window.testUIHelper.final_result = () => "Completed: 2 Pass, 1 Fail";
    });

    // Trigger run tests (use evaluate click since button is inside modal)
    await page.evaluate(() => document.getElementById("assistant_run_button").click());

    // Wait for tests to complete
    await page.waitForFunction(() => {
      const item2 = document.getElementById("assistant_item_2");
      return item2 && item2.innerText === "Failed";
    }, { timeout: 5000 });

    // Assert Test 0 and Test 1 show "Pass" in darkgreen
    const item0Text = await page.locator("#assistant_item_0").innerText();
    const item0Color = await page.locator("#assistant_item_0").evaluate((el) => el.style.color);
    expect(item0Text).toBe("Pass");
    expect(item0Color).toBe("darkgreen");

    const item1Text = await page.locator("#assistant_item_1").innerText();
    const item1Color = await page.locator("#assistant_item_1").evaluate((el) => el.style.color);
    expect(item1Text).toBe("Pass");
    expect(item1Color).toBe("darkgreen");

    // Assert Test 2 shows "Failed" in darkred
    const item2Text = await page.locator("#assistant_item_2").innerText();
    const item2Color = await page.locator("#assistant_item_2").evaluate((el) => el.style.color);
    expect(item2Text).toBe("Failed");
    expect(item2Color).toBe("darkred");

    // Assert final result updated
    const finalResult = await page.locator("#assistant_final_result").innerText();
    expect(finalResult).toBe("Completed: 2 Pass, 1 Fail");
  });

  test("Suite 3.2: Fail-Early Logic", async ({ page }) => {
    await page.evaluate(async () => {
      const { UI_Helper } = await import("./modules/assistant.js");

      const testList = document.getElementById("assistant_test_list");
      if (testList) testList.innerHTML = "";

      window.testUIHelper = new UI_Helper("Fail Early Pipeline");
      window.testUIHelper.sleep = () => Promise.resolve();

      window.test2Executed = false;

      // Test 0: fail_early = true, returns false
      window.testUIHelper.add_test(
        "Critical Test 0",
        async () => false,
        { fail_early: true }
      );

      // Test 1: Should NOT execute
      window.testUIHelper.add_test("Subsequent Test 1", async () => {
        window.test2Executed = true;
        return true;
      });

      window.testUIHelper.final_result = () => "Terminated early due to failure";
    });

    await page.evaluate(() => document.getElementById("assistant_run_button").click());

    await page.waitForFunction(() => {
      const item0 = document.getElementById("assistant_item_0");
      return item0 && item0.innerText === "Failed";
    }, { timeout: 5000 });

    // Assert Test 0 shows "Failed"
    const item0Text = await page.locator("#assistant_item_0").innerText();
    expect(item0Text).toBe("Failed");

    // Assert Test 1 was NOT executed
    const item1Text = await page.locator("#assistant_item_1").innerText();
    expect(item1Text).toBe("");

    const wasTest2Executed = await page.evaluate(() => window.test2Executed);
    expect(wasTest2Executed).toBe(false);

    // Assert final result updated
    const finalResult = await page.locator("#assistant_final_result").innerText();
    expect(finalResult).toBe("Terminated early due to failure");
  });

  test("Suite 3.3: Interactive Command & Output Matcher", async ({ page }) => {
    const outputMatchSuccess = await page.evaluate(async () => {
      const { Assistant_Script } = await import("./modules/assistant.js");
      const script = new Assistant_Script();
      script.stdoutBuffer = "";
      script.stderrBuffer = "";

      setTimeout(() => {
        script.stdoutBuffer += "Expected Hello\n";
        if (script.stdioCallback) script.stdioCallback();
      }, 50);

      const startTime = Date.now();
      await script.wait_for_output({ msg: "Expected Hello", timeout: 2000 });
      const duration = Date.now() - startTime;

      return duration < 2000 && script.stdoutBuffer.includes("Expected Hello");
    });

    expect(outputMatchSuccess).toBe(true);

    const timeoutHandled = await page.evaluate(async () => {
      const { Assistant_Script } = await import("./modules/assistant.js");
      const script = new Assistant_Script();
      script.stdoutBuffer = "";
      script.stderrBuffer = "";

      const startTime = Date.now();
      await script.wait_for_output({ msg: "Nonexistent Output", timeout: 300 });
      const duration = Date.now() - startTime;

      return duration >= 250;
    });

    expect(timeoutHandled).toBe(true);
  });
});
