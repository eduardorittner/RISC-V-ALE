// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";

// toast.js is a plain script that installs `Toast` on the global object.
import "../../assets/js/toast.js";

const HOSTILE = `<img src=x onerror="window.__pwned = true">`;

describe("Toast rendering never parses input as markup", () => {
  beforeAll(() => {
    window.__pwned = false;
  });

  it("renders a hostile title and body as text", () => {
    const toast = window.Toast.error({
      title: HOSTILE,
      text: HOSTILE,
      delay: Infinity,
    });

    const elem = toast.elem;
    expect(elem.querySelectorAll("img").length).toBe(0);
    expect(elem.querySelector(".toast-title").textContent).toBe(HOSTILE);
    expect(elem.querySelector(".toast-body").textContent).toBe(HOSTILE);
    expect(elem.innerHTML).not.toContain("<img");
    expect(window.__pwned).toBe(false);
  });

  it("renders a hostile update as text", () => {
    const toast = window.Toast.info({ title: "safe", text: "safe", delay: Infinity });
    toast.update({ title: HOSTILE, text: HOSTILE });

    expect(toast.elem.querySelectorAll("img").length).toBe(0);
    expect(toast.elem.querySelector(".toast-title").textContent).toBe(HOSTILE);
    expect(window.__pwned).toBe(false);
  });

  it("keeps the close button working after a hostile render", () => {
    const toast = window.Toast.error({ title: HOSTILE, text: HOSTILE, delay: Infinity });
    const closeBtn = /** @type {HTMLElement} */ (
      toast.elem.querySelector(".toast-close")
    );
    expect(closeBtn).not.toBeNull();
    expect(typeof closeBtn.onclick).toBe("function");
  });

  it("renders a hostile confirm dialog as text", () => {
    window.Toast.confirm({ title: HOSTILE, text: HOSTILE });
    const backdrop = document.querySelector(".toast-modal-backdrop");
    expect(backdrop).not.toBeNull();
    expect(backdrop.querySelectorAll("img").length).toBe(0);
    expect(backdrop.querySelector(".toast-modal-body").textContent).toBe(HOSTILE);
    expect(window.__pwned).toBe(false);
  });

  it("preserves newlines in the body without injecting elements", () => {
    const toast = window.Toast.info({ title: "t", text: "a\nb", delay: Infinity });
    const body = /** @type {HTMLElement} */ (
      toast.elem.querySelector(".toast-body")
    );
    expect(body.textContent).toBe("a\nb");
    expect(body.querySelectorAll("br").length).toBe(0);
    expect(body.style.whiteSpace).toBe("pre-line");
  });
});
