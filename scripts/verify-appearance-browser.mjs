// Synthetic DOM checks only: no running Foundry world or saved settings are touched.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const repo = fileURLToPath(new URL("../", import.meta.url));
const root = path.join(repo, "dmicher-generics");
const playwrightPath = process.env.PLAYWRIGHT_PACKAGE;
const browserPath = process.env.BROWSER_EXECUTABLE;
if (!playwrightPath || !browserPath) throw Error("Set PLAYWRIGHT_PACKAGE and BROWSER_EXECUTABLE to installed development tools.");
const { chromium } = createRequire(import.meta.url)(playwrightPath);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (pathname === "/") { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><meta charset=utf-8><body></body>"); return; }
  const filename = path.resolve(root, "." + pathname);
  if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename)) { response.writeHead(404); response.end(); return; }
  response.setHeader("Content-Type", filename.endsWith(".js") ? "text/javascript" : filename.endsWith(".css") ? "text/css" : "text/plain");
  response.end(fs.readFileSync(filename));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const initial = await page.evaluate(async () => {
    const { prepareCustomStyles } = await import("/scripts/custom-styles.js");
    const { createAppearanceController } = await import("/scripts/appearance.js");
    const { createPremiumBridge } = await import("/scripts/premium.js");
    document.body.innerHTML = `<div id="outside">Outside</div><div id="one" class="dmicher-window" style="position:fixed;left:200px;top:100px;width:200px;height:100px"><header class="window-header">First</header><button>Control</button></div><div id="two" class="dmicher-window" style="position:fixed;left:600px;top:200px;width:200px;height:200px"><header class="window-header">Second</header></div>`;
    const style = document.createElement("style"); style.textContent = "body{margin:0;color:black}.window-header{height:30px;background:#aaa}.dmicher-window{border:1px solid black;box-sizing:border-box}"; document.head.append(style);
    const events = new Map(); let counter = 0;
    const Hooks = { on(name, fn) { const id = ++counter; events.set(id, { name, fn }); return id; }, once(name, fn) { return this.on(name, fn); }, off(name, id) { events.delete(id); } };
    const values = new Map([["theme", "dark"], ["snapScreen", true], ["snapWindows", true], ["snapCorners", true], ["snapCenters", true], ["customStyles", ".dmicher-window {color: rgb(255, 0, 0)} body {color: rgb(0, 128, 0)}"], ["appearanceInitialized", true]]);
    globalThis.game = { settings: { get: (_, key) => values.get(key) }, i18n: { lang: "en" } };
    const instances = new Map(); globalThis.foundry = { applications: { instances } };
    for (const id of ["one", "two"]) {
      const element = document.getElementById(id);
      const app = { element, rendered: true, setPosition(position) { element.style.left = `${position.left}px`; element.style.top = `${position.top}px`; } }; instances.set(id, app);
      element.querySelector("header").addEventListener("pointerdown", (event) => {
        const start = element.getBoundingClientRect(), x = event.clientX, y = event.clientY;
        const move = (next) => app.setPosition({ left: start.left + next.clientX - x, top: start.top + next.clientY - y });
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", () => document.removeEventListener("pointermove", move), { once: true });
      });
    }
    let access = true;
    const premium = createPremiumBridge();
    const registration = premium.registerProvider({ apiVersion: 1, hasAccess: () => access, extensions: [{ moduleId: "dmicher-generics", apiVersion: 1, methods: { resolveCustomStyles: (base, css) => css } }] });
    const appearance = createAppearanceController({ premium, help: {} }); appearance.install(Hooks);
    for (const app of instances.values()) for (const entry of events.values()) if (entry.name === "renderApplicationV2") entry.fn(app);
    globalThis.check = { appearance, values, instances, revoke() { access = false; registration.notifyChanged(); }, restore() { access = true; registration.notifyChanged(); } };
    let invalid = 0;
    for (const css of ["@import 'https://example.com/theme.css'; div { color:red }", "@font-face {font-family:x;src:url(x)}", "a".repeat(65537)]) {
      try { prepareCustomStyles(css); } catch { invalid++; }
    }
    const escaped = prepareCustomStyles("} body {color: red} .dmicher-window {color: blue}");
    return { scoped: escaped.startsWith("@scope (.dmicher-window)"), outside: getComputedStyle(document.getElementById("outside")).color,
      inside: getComputedStyle(document.getElementById("one")).color, invalid };
  });
  assert.deepEqual(initial, { scoped: true, outside: "rgb(0, 0, 0)", inside: "rgb(255, 0, 0)", invalid: 3 }); results.push("CSS scope confines imported rules and rejects unsupported global rules/oversized files");
  await page.mouse.move(240, 115); await page.mouse.down(); await page.mouse.move(49, 115); await page.waitForTimeout(35);
  assert.equal(await page.locator("#one").evaluate((element) => element.getBoundingClientRect().left), 0);
  await page.mouse.move(55, 115); await page.waitForTimeout(35);
  assert.equal(await page.locator("#one").evaluate((element) => element.getBoundingClientRect().left), 15);
  await page.mouse.up(); results.push("Actual pointer drag snaps within 12 px and releases using the original pointer delta");
  await page.evaluate(() => check.instances.get("one").setPosition({ left: 9, top: 100 }));
  assert.equal(await page.locator("#one").evaluate((element) => element.getBoundingClientRect().left), 9); results.push("Programmatic placement remains unchanged");
  const access = await page.evaluate(() => {
    check.revoke(); const revoked = getComputedStyle(document.getElementById("one")).color;
    check.restore(); const restored = getComputedStyle(document.getElementById("one")).color;
    check.appearance.dispose(); return { revoked, restored, retained: Boolean(check.values.get("customStyles")), stylesAfterDispose: document.querySelectorAll("style[data-dmicher-custom-style]").length };
  });
  assert.deepEqual(access, { revoked: "rgb(0, 0, 0)", restored: "rgb(255, 0, 0)", retained: true, stylesAfterDispose: 0 }); results.push("Access revocation removes the CSS layer, restoration reapplies it, and dispose removes resources");
  const output = path.resolve(repo, "../artifacts/dmicher-generics/1.0.0/appearance-browser-report.json"); fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ scope: "Synthetic browser DOM; not a live Foundry session", browser: await browser.version(), results }, null, 2));
  console.log(JSON.stringify({ output, checks: results.length }));
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
