#!/usr/bin/env node

// Loads the reader site and Studio in Chromium at six widths and two text sizes, and fails on what a reader would
// hit: a page wider than the screen, text under 12px, or a control too small to tap (44px on touch screens, 24px
// with a mouse, WCAG 2.5.8). Run it against a running app with the demo Studio enabled, for example
//   ATLASNEWS_CONTENT_MODE=demo ATLASNEWS_ENABLE_DEMO_STUDIO=true pnpm start
//   pnpm responsive:check [origin] [--shots <dir>] [--only <route>] [--widths 320,375]
// "200%" is the browser's own font-size setting (32px instead of 16px), as a reader sets it, so rem media queries
// follow it too. It uses Playwright's Chromium (PLAYWRIGHT_BROWSERS_PATH) or, failing that, the installed Chrome.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args.splice(index, 2)[1];
};
const shots = option("--shots");
const only = option("--only");
const pickedWidths = option("--widths");
const origin = (args[0] ?? "http://localhost:3000").replace(/\/$/, "");
const widths = pickedWidths ? pickedWidths.split(",").map(Number) : [320, 375, 768, 1024, 1440, 1920];
const textSizes = [16, 32];
const touchUpTo = 1024;
// The pages a screenshot is kept for, at a phone and a desktop width.
const shotRoutes = new Set(["/en", "/en/articles/:slug", "/en/studio", "/en/studio/articles/:id"]);
const shotWidths = new Set([375, 1440]);

async function firstHref(page, path, pattern) {
  await page.goto(`${origin}${path}`);
  return page.evaluate((source) => {
    const match = [...document.querySelectorAll("a[href]")]
      .map((link) => link.getAttribute("href"))
      .find((href) => new RegExp(source).test(href));
    return match ?? null;
  }, pattern.source);
}

async function routes(browser) {
  const page = await browser.newPage();
  const article = await firstHref(page, "/en", /^\/en\/articles\/[^/?#]+$/);
  const category = await firstHref(page, "/en", /^\/en\/categories\/[^/?#]+$/);
  const entity = await firstHref(page, "/en", /^\/en\/entities\/[^/?#]+$/);
  const draft = await firstHref(page, "/en/studio/articles", /^\/en\/studio\/articles\/(?!new|bulk)[^/?#]+$/);
  await page.close();
  return [
    ["/en", "/en"],
    ["/en/latest", "/en/latest"],
    ["/en/articles/:slug", article],
    ["/en/categories/:slug", category],
    ["/en/entities", "/en/entities"],
    ["/en/entities/:slug", entity],
    ["/en/status/:status", "/en/status/confirmed"],
    ["/en/search", "/en/search?q=model"],
    ["/en/support", "/en/support"],
    ["/en/privacy", "/en/privacy"],
    ["/en/not-found", "/en/no-such-page"],
    ["/en/login", "/en/login"],
    ["/en/studio", "/en/studio"],
    ["/en/studio/articles", "/en/studio/articles"],
    ["/en/studio/articles/new", "/en/studio/articles/new"],
    ["/en/studio/articles/:id", draft],
    ["/en/studio/media", "/en/studio/media"],
    ["/en/studio/categories", "/en/studio/categories"],
    ["/en/studio/entities", "/en/studio/entities"],
    ["/en/studio/comments", "/en/studio/comments"],
    ["/en/studio/inbox", "/en/studio/inbox"],
    ["/en/studio/newsletter", "/en/studio/newsletter"],
    ["/en/studio/distribution", "/en/studio/distribution"],
    ["/en/studio/team", "/en/studio/team"],
  ].filter(([name, path]) => path && (!only || name === only));
}

/** Runs in the page: what overflows, what is too small to read and what is too small to tap. */
function inspect({ touch }) {
  const root = document.documentElement;
  const width = root.clientWidth;
  const describe = (element) => {
    const id = element.id ? `#${element.id}` : "";
    const classes = [...element.classList].slice(0, 2).map((name) => `.${name}`).join("");
    const text = classes || id ? "" : `"${element.textContent.trim().slice(0, 24)}"`;
    return `${element.tagName.toLowerCase()}${id}${classes}${text}`;
  };
  const visible = (element) => {
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  };
  // A box clipped by a scroller (a sideways rail) is not page overflow.
  const clipped = (element) => {
    for (let node = element.parentElement; node && node !== root && node !== document.body; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowX;
      if (overflow !== "visible") return true;
    }
    return false;
  };

  const overflow = Math.max(0, root.scrollWidth - width);
  const wide = [];
  if (overflow > 0) {
    for (const element of document.body.querySelectorAll("*")) {
      const rect = element.getBoundingClientRect();
      if (rect.right > width + 0.5 && visible(element) && !clipped(element)) wide.push(`${describe(element)} ${Math.round(rect.right - width)}px`);
    }
  }

  const small = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement;
    if (!element || !node.textContent.trim() || !visible(element)) continue;
    if (getComputedStyle(element).clip !== "auto") continue;
    const size = parseFloat(getComputedStyle(element).fontSize);
    if (size < 12) small.add(`${describe(element)} ${size}px`);
  }

  const minimum = touch ? 44 : 24;
  const targets = new Set();
  const controls = document.querySelectorAll(
    "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch]",
  );
  for (const element of controls) {
    if (!visible(element) || element.closest("[inert], [aria-hidden=true]")) continue;
    // A link inside a sentence is exempt (WCAG 2.5.8 "inline"), and a box or radio counts with its label.
    const style = getComputedStyle(element);
    if (element.tagName === "A" && style.display === "inline" && element.closest("p, li, dd, td, blockquote, figcaption")) {
      const text = element.closest("p, li, dd, td, blockquote, figcaption").textContent.trim();
      if (text.length > element.textContent.trim().length + 1) continue;
    }
    // A stretched link (an absolute ::after over its card or row) is as big as what it covers.
    const after = getComputedStyle(element, "::after");
    let cover = null;
    if (after.position === "absolute" && after.content !== "none") {
      for (let node = element.parentElement; node && !cover; node = node.parentElement) {
        if (getComputedStyle(node).position !== "static") cover = node;
      }
    }
    const box = cover ?? (element.matches("input[type=checkbox], input[type=radio]") && element.closest("label")
      ? element.closest("label")
      : element);
    const rect = box.getBoundingClientRect();
    if (Math.round(rect.width) < minimum || Math.round(rect.height) < minimum) {
      targets.add(`${describe(element)} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
    }
  }

  return { overflow, wide: wide.slice(0, 6), small: [...small].slice(0, 6), smallCount: small.size, targets: [...targets].slice(0, 8), targetCount: targets.size };
}

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chrome" });
  }
}

const browser = await launch();
const list = await routes(browser);
if (shots) await mkdir(shots, { recursive: true });
const failures = [];
let loads = 0;

for (const width of widths) {
  for (const textSize of textSizes) {
    const touch = width <= touchUpTo;
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: touch,
      isMobile: touch,
      reducedMotion: "reduce",
    });
    for (const [name, path] of list) {
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      await session.send("Page.setFontSizes", { fontSizes: { standard: textSize, fixed: Math.round(textSize * 0.8125) } });
      const response = await page.goto(`${origin}${path}`, { waitUntil: "load" });
      // Some Studio pages keep a request open, so a quiet network is waited for briefly, not required.
      await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(inspect, { touch });
      loads += 1;
      const label = `${name} @${width}px ${textSize === 16 ? "100%" : "200%"}`;
      const status = response?.status() ?? 0;
      if (status >= 500) failures.push(`${label}: HTTP ${status}`);
      if (result.overflow > 0) failures.push(`${label}: ${result.overflow}px wider than the screen (${result.wide.join(", ")})`);
      if (result.smallCount > 0) failures.push(`${label}: ${result.smallCount} texts under 12px (${result.small.join(", ")})`);
      if (result.targetCount > 0) failures.push(`${label}: ${result.targetCount} targets under ${touch ? 44 : 24}px (${result.targets.join(", ")})`);
      if (shots && textSize === 16 && shotWidths.has(width) && shotRoutes.has(name)) {
        const file = `${name.replace(/^\/en\/?/, "").replace(/[/:]+/g, "-") || "home"}-${width}.png`;
        await page.screenshot({ path: join(shots, file), fullPage: true });
      }
      await page.close();
    }
    await context.close();
  }
}

await browser.close();
console.log(`${loads} page loads: ${list.length} routes x ${widths.length} widths x ${textSizes.length} text sizes.`);
if (failures.length) {
  console.error(failures.join("\n"));
  console.error(`${failures.length} problems.`);
  process.exitCode = 1;
} else {
  console.log("No overflow, no text under 12px, every target big enough.");
}
