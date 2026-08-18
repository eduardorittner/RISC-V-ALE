import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const home = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "data/home.json"), "utf-8"),
);
const config = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "data/config.json"), "utf-8"),
);

/** Collect console errors and uncaught page errors for the whole test. */
function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

/**
 * The tutorial links are hash routes. Load the page first, then set the hash so
 * the router runs against a fully initialised page, exactly as a click does.
 */
async function openHashRoute(page, hash) {
  await page.goto("/index.html");
  await page.waitForFunction(() => typeof window.simulator_controller !== "undefined");
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
}

const hashTutorials = home.tutorials.filter((t) => t.link1.startsWith("#"));

test.describe("Home tab tutorial links", () => {
  test("every tutorial in data/home.json is rendered as a card with its link", async ({
    page,
  }) => {
    await page.goto("/index.html");
    const list = page.locator("#home_tab_tutorials_list li");
    await expect(list).toHaveCount(home.tutorials.length);
    for (const tutorial of home.tutorials) {
      await expect(
        page.locator(`#home_tab_tutorials_list a[href="${tutorial.link1}"]`),
      ).toHaveCount(1);
    }
  });

  for (const tutorial of hashTutorials) {
    test(`the "${tutorial.title}" link loads its content with no console errors`, async ({
      page,
    }) => {
      const errors = watchErrors(page);
      await openHashRoute(page, tutorial.link1);

      // The content pane replaces the card list with the tutorial iframe.
      await expect(page.locator("#selected_content iframe")).toHaveCount(1, {
        timeout: 10000,
      });
      await expect(page.locator("#selected_content")).not.toHaveAttribute(
        "hidden",
        /.*/,
      );
      await expect(page.locator("#content_selection")).toHaveAttribute(
        "hidden",
        /.*/,
      );

      expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
    });
  }

  for (const id of Object.keys(config)) {
    test(`the #select_content=${id} route loads content with no console errors`, async ({
      page,
    }) => {
      const errors = watchErrors(page);
      await openHashRoute(page, `#select_content=${id}`);

      await expect(page.locator("#selected_content iframe")).toHaveCount(1, {
        timeout: 10000,
      });
      const src = await page
        .locator("#selected_content iframe")
        .getAttribute("src");
      expect(src).toBe(config[id].main_page);

      expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
    });
  }
});
