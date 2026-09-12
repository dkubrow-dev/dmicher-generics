// Real module templates and installed Foundry 13/14 CSS in a synthetic browser scene.
// No live world, client settings or player documents are opened or modified.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), workspace = path.dirname(repo);
const output = path.join(workspace, "artifacts/dmicher-generics/1.0.0/revision-ui-preview"); fs.mkdirSync(output, { recursive: true });
const { chromium } = createRequire(import.meta.url)(path.join(process.env.CODEX_NODE_MODULES ?? path.join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"), "playwright"));
const host = http.createServer((request, response) => {
  const route = decodeURIComponent((request.url ?? "/").split("?")[0]); let filename;
  if (route === "/") return response.writeHead(200, { "Content-Type": "text/html" }).end('<!doctype html><meta charset="utf-8"><body class="game theme-dark"></body>');
  const module = /^\/modules\/(dmicher-(?:generics|spotlight-tools))\/(.+)$/.exec(route);
  if (module) { const root = path.join(workspace, module[1], module[1]), candidate = path.resolve(root, module[2]); if (candidate.startsWith(root + path.sep)) filename = candidate; }
  else if (route === "/handlebars.js") filename = "E:/Foundry Portable/Foundry VTT 14.366/App/resources/app/node_modules/handlebars/dist/handlebars.js";
  else if (/^\/core\/(13\.351|14\.366)\.css$/.test(route)) filename = `E:/Foundry Portable/Foundry VTT ${route.slice(6, -4)}/App/resources/app/public/css/foundry2.css`;
  if (!filename || !fs.existsSync(filename)) return response.writeHead(404).end();
  response.writeHead(200, { "Content-Type": `${filename.endsWith(".css") ? "text/css" : filename.endsWith(".js") ? "text/javascript" : "text/plain"}; charset=utf-8` }); fs.createReadStream(filename).pipe(response);
});
await new Promise(resolve => host.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${host.address().port}`, browser = await chromium.launch({ executablePath: process.env.BROWSER_EXE ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const report = [];
try {
  for (const version of ["13.351", "14.366"]) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } }), errors = [];
    page.on("pageerror", error => errors.push(error.message)); await page.goto(base);
    for (const url of [`/core/${version}.css`, "/modules/dmicher-generics/styles/dmicher-generics.css", "/modules/dmicher-generics/styles/help.css", "/modules/dmicher-generics/styles/components.css", "/modules/dmicher-spotlight-tools/styles/dmicher-spotlight-tools.css"]) await page.addStyleTag({ url: base + url });
    await page.addStyleTag({ content: "body{margin:0;font-family:Arial;background:#35433e}.application{position:fixed;margin:0;inset:auto;left:20px;top:20px;width:950px;max-height:850px}.window-content{overflow:auto}.dmicher-setting-help i::before{content:'?';font:bold 12px Arial}.qa-window{position:fixed;display:block;width:200px;height:100px;margin:0;max-height:none}.qa-window header{height:30px;cursor:move;background:#aaa;color:#111}.qa-window .window-content{padding:0}.dmicher-color-field{max-width:220px}" });
    await page.addScriptTag({ url: base + "/handlebars.js" });
    const before = await page.evaluate(async () => {
      globalThis.game = { i18n: { lang: "en" } };
      const dictionary = (await (await fetch("/modules/dmicher-spotlight-tools/lang/en.json")).json()).DMICHERSPOTLIGHTTOOLS;
      Handlebars.registerHelper("localize", key => key.replace(/^DMICHERSPOTLIGHTTOOLS\./, "").split(".").reduce((value, part) => value?.[part], dictionary) ?? key);
      const template = await (await fetch("/modules/dmicher-spotlight-tools/templates/request-settings.hbs")).text();
      document.body.innerHTML = '<section class="application dmicher-window dmicher-spotlight-tools dmicher-request-settings" data-dmicher-theme="dark"><header class="window-header">Request settings</header><div class="window-content"></div></section>';
      document.querySelector(".window-content").innerHTML = Handlebars.compile(template)({ requests: ["regular", "urgent", "environment"].map(urgency => ({ urgency, label: urgency, color: "#FFFFFF", fontSize: "16px", text: "Example", underline: true, alignCenter: true })) });
      window.questionCalls = []; window.controlClicks = 0;
      document.querySelector("form").addEventListener("click", event => { if (event.target.closest("[data-request-font-toggle]")) controlClicks++; });
      const { bindSettingHelp } = await import("/modules/dmicher-generics/scripts/help/index.js");
      const { getSettingHelpEntries } = await import("/modules/dmicher-spotlight-tools/scripts/tools/requests/request-help-content.js");
      window.normalHelpDisposer = bindSettingHelp(document.querySelector("form"), { open: (...args) => questionCalls.push(args), entries: getSettingHelpEntries("en").filter(entry => !entry.selector.includes("data-request-font-toggle")) });
      window.measure = () => [...document.querySelectorAll("[data-request-font-toggle]")].map(button => { const r = button.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
      return measure();
    });
    const after = await page.evaluate(async () => {
      const { bindSettingHelp } = await import("/modules/dmicher-generics/scripts/help/index.js");
      const { getSettingHelpEntries } = await import("/modules/dmicher-spotlight-tools/scripts/tools/requests/request-help-content.js");
      window.helpDisposer = bindSettingHelp(document.querySelector("form"), { open: (...args) => questionCalls.push(args), entries: getSettingHelpEntries("en").filter(entry => entry.selector.includes("data-request-font-toggle")) }); return measure();
    });
    assert.deepEqual(after, before, "Question overlays must not change U/I/B geometry");
    const questions = page.locator(".dmicher-setting-help-overlay"); assert.equal(await questions.count(), 9);
    for (let i = 0; i < 3; i++) {
      assert.equal(await questions.nth(i).evaluate(el => getComputedStyle(el).textDecorationLine), "none");
      await questions.nth(i).click();
    }
    assert.equal(await page.evaluate(() => controlClicks), 0); assert.equal(await page.evaluate(() => questionCalls.length), 3);
    await page.locator('[data-request-font-toggle="Underline"]').first().click(); assert.equal(await page.evaluate(() => controlClicks), 1);
    await page.evaluate(() => document.querySelector("fieldset.dmicher-settings-block").disabled = true);
    await questions.first().click(); assert.equal(await page.evaluate(() => questionCalls.length), 4);
    await page.screenshot({ path: path.join(output, `spotlight-help-buttons-${version}.png`) });
    await page.evaluate(() => { helpDisposer(); }); assert.deepEqual(await page.evaluate(() => measure()), before);
    report.push({ version, test: "Real Spotlight U/I/B template: geometry, help click isolation, disabled fieldset, no underline and disposal", passed: true });
    const tableHelp = await page.evaluate(async () => {
      const { bindSettingHelp } = await import("/modules/dmicher-generics/scripts/help/index.js");
      document.body.innerHTML = '<section class="dmicher-window" style="padding:20px"><table><tbody><tr id="outer-row"><th scope="row">Outer</th><td><table><tbody><tr id="parameter-row"><th scope="row">Type</th><td><span><input id="parameter-value" value="string"></span></td></tr><tr id="label-row"><th scope="row">Caption</th><td><label>Explicit label <input id="label-value" value="unchanged"></label></td></tr></tbody></table></td></tr></tbody></table></section>';
      const root = document.querySelector("section"), entries = ["parameter-value", "label-value"].map(id => ({ selector: `#${id}`, pageId: "parameters", anchor: id, hint: "Explain parameter" }));
      const beforeHeight = document.getElementById("parameter-row").getBoundingClientRect().height;
      const calls = [], dispose = bindSettingHelp(root, { entries, open: (...args) => calls.push(args), tabIndex: -1 });
      const repeat = bindSettingHelp(root, { entries, open() {} });
      const output = {
        ownHeader: Boolean(root.querySelector('#parameter-row > th .dmicher-setting-help')),
        outerHeader: Boolean(root.querySelector('#outer-row > th .dmicher-setting-help')),
        valueCell: Boolean(root.querySelector('#parameter-row > td .dmicher-setting-help')),
        explicitLabel: Boolean(root.querySelector('#label-row label .dmicher-setting-help')),
        questions: root.querySelectorAll('.dmicher-setting-help').length,
        heightDelta: document.getElementById("parameter-row").getBoundingClientRect().height - beforeHeight
      };
      root.querySelector('#parameter-row > th .dmicher-setting-help').click();
      output.calls = calls; output.value = document.getElementById("parameter-value").value;
      repeat(); dispose(); output.afterDispose = root.querySelectorAll('.dmicher-setting-help').length;
      return output;
    });
    assert.equal(tableHelp.ownHeader, true); assert.equal(tableHelp.outerHeader, false); assert.equal(tableHelp.valueCell, false);
    assert.equal(tableHelp.explicitLabel, true); assert.equal(tableHelp.questions, 2); assert.equal(tableHelp.heightDelta, 0);
    assert.deepEqual(tableHelp.calls, [["parameters", "parameter-value"]]); assert.equal(tableHelp.value, "string"); assert.equal(tableHelp.afterDispose, 0);
    report.push({ version, test: "Nested parameter tables: own row caption, explicit label priority, unchanged row height, help click and disposal", passed: true });
    await page.evaluate(async () => {
      document.body.innerHTML = '<section class="dmicher-window" style="padding:20px"></section>';
      const components = await import("/modules/dmicher-generics/scripts/components.js");
      const root = document.querySelector("section"); root.innerHTML = components.renderColorField({ name: "background", value: "#ABCDEF", label: "Background" }) + components.renderJSONControls({ id: "example" });
      window.releaseColors = components.bindColorFields(root); window.imported = [];
      const transfer = components.createJSONTransfer({ filename: "scene-example.json", exportValue: () => ({ kind: "example", color: root.querySelector('[name="background"]').value }),
        validate(value) { if (value.kind !== "example") throw Error("Wrong kind"); return value; }, importValue: value => imported.push(value) });
      window.releaseJSON = transfer.bind(root, "example");
    });
    await page.locator('[name="background"]').fill("#123abc"); await page.locator('[name="background"]').blur();
    assert.equal(await page.locator('[name="background"]').inputValue(), "#123ABC");
    assert.equal(await page.locator('[type="color"]').inputValue(), "#123abc");
    await page.locator('[type="color"]').fill("#aabbcc"); assert.equal(await page.locator('[name="background"]').inputValue(), "#AABBCC");
    await page.locator('[name="background"]').fill("invalid"); assert.equal(await page.locator('[name="background"]').evaluate(el => el.checkValidity()), false);
    await page.locator('[name="background"]').fill("#112233");
    const downloadEvent = page.waitForEvent("download"); await page.locator('[data-dmicher-json="export"]').click(); const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), "scene-example.json"); await download.saveAs(path.join(output, `component-export-${version}.json`));
    const chooserEvent = page.waitForEvent("filechooser"); await page.locator('[data-dmicher-json="import"]').click(); const chooser = await chooserEvent;
    await chooser.setFiles({ name: "example.json", mimeType: "application/json", buffer: Buffer.from('{"kind":"example","color":"#445566"}') });
    await page.waitForFunction(() => imported.length === 1); await page.evaluate(() => { releaseColors(); releaseJSON(); });
    report.push({ version, test: "Color text/native palette, invalid input, JSON download and contextual file import", passed: true });
    await page.evaluate(async () => {
      document.body.innerHTML = ""; window.apps = new Map(); window.snapSettings = { screen: false, windows: true, corners: true, centers: true, cascadeRightButton: true };
      const { createWindowSnapController } = await import("/modules/dmicher-generics/scripts/window-snapping.js"); window.snap = createWindowSnapController({ getSettings: () => snapSettings });
      for (const [id, left] of [["a", 100], ["b", 400], ["c", 700]]) {
        const element = document.createElement("section"); element.id = id; element.className = "application dmicher-window qa-window";
        element.style.left = `${left}px`; element.style.top = "200px"; element.innerHTML = `<header class="window-header">${id}</header><div class="window-content">Window ${id}</div>`; document.body.append(element);
        const app = { id, element, setPosition(position) { for (const key of ["left", "top"]) if (key in position) element.style[key] = `${position[key]}px`; } }; apps.set(id, app);
        element.querySelector("header").addEventListener("pointerdown", event => {
          if (event.button !== 0) return;
          const start = element.getBoundingClientRect(), x = event.clientX, y = event.clientY;
          const move = next => app.setPosition({ left: start.left + next.clientX - x, top: start.top + next.clientY - y });
          document.addEventListener("pointermove", move); document.addEventListener("pointerup", () => document.removeEventListener("pointermove", move), { once: true });
        }); snap.bind(app);
      }
      window.positions = () => [...apps.values()].map(app => { const r = app.element.getBoundingClientRect(); return [r.left, r.top]; });
    });
    const drag = async (id, dx, dy, button = "left") => {
      const box = await page.locator(`#${id} header`).boundingBox(); await page.mouse.move(box.x + 35, box.y + 15); await page.mouse.down({ button });
      await page.mouse.move(box.x + 35 + dx, box.y + 15 + dy, { steps: 3 }); await page.waitForTimeout(35); await page.mouse.up({ button }); await page.waitForTimeout(35);
    };
    await drag("a", 107, 0); await drag("c", -93, 0);
    assert.deepEqual(await page.evaluate(() => snap.getLayout().links), [{ from: "a", to: "b" }, { from: "b", to: "c" }]);
    assert.deepEqual(await page.evaluate(() => positions()), [[200, 200], [400, 200], [600, 200]]);
    await drag("a", 35, 40, "right"); assert.deepEqual(await page.evaluate(() => positions()), [[235, 240], [435, 240], [635, 240]]);
    assert.equal(await page.evaluate(() => snap.getLayout().links.length), 2);
    const normalContext = await page.evaluate(() => { const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true }); apps.get("b").element.dispatchEvent(event); return event.defaultPrevented; });
    assert.equal(normalContext, false, "Unrelated context menu must stay available");
    await page.screenshot({ path: path.join(output, `snapped-cascade-${version}.png`) });
    await drag("b", 0, 180); assert.equal(await page.evaluate(() => snap.getLayout().links.length), 0);
    assert.deepEqual(await page.evaluate(() => positions()), [[235, 240], [435, 420], [635, 240]]);
    await drag("b", -6, -177); assert.equal(await page.evaluate(() => snap.getLayout().links.length), 1);
    await page.evaluate(() => { apps.get("b").element.style.width = "210px"; }); await page.waitForTimeout(35);
    assert.equal(await page.evaluate(() => snap.getLayout().links.length), 0);
    await drag("a", 6, 0); assert.equal(await page.evaluate(() => snap.getLayout().links.length), 1);
    await page.evaluate(() => { snapSettings.cascadeRightButton = false; snap.refresh(); }); const stopped = await page.evaluate(() => positions());
    await drag("a", 20, 20, "right"); assert.deepEqual(await page.evaluate(() => positions()), stopped);
    await page.evaluate(() => { snapSettings.windows = false; snap.refresh(); }); assert.equal(await page.evaluate(() => snap.getLayout().links.length), 0);
    await page.evaluate(() => {
      snapSettings.windows = true; snapSettings.cascadeRightButton = true;
      for (const [id, left] of [["a", 100], ["b", 400], ["c", 700]]) { apps.get(id).element.style.width = "200px"; apps.get(id).setPosition({ left, top: 200 }); }
      snap.refresh();
    });
    await drag("a", 107, 0); await drag("c", -93, 0); assert.equal(await page.evaluate(() => snap.getLayout().links.length), 2);
    await page.evaluate(() => {
      const frame = document.createElement("iframe"); document.body.append(frame);
      frame.contentDocument.body.append(frame.contentDocument.adoptNode(apps.get("b").element)); snap.refresh();
    });
    assert.equal(await page.evaluate(() => snap.getLayout().links.length), 0, "Adopting a window into another document releases its old neighbors");
    await page.evaluate(() => { document.body.append(document.adoptNode(apps.get("b").element)); snap.refresh(); });
    await drag("a", 7, 0); assert.equal(await page.evaluate(() => snap.getLayout().links.length), 1);
    await page.evaluate(() => { apps.get("b").element.remove(); snap.refresh(); }); assert.equal(await page.evaluate(() => snap.getLayout().links.length), 0);
    assert.equal(await page.evaluate(() => snap.getLayout().windows.length), 2);
    await page.evaluate(() => { snap.dispose(); }); assert.equal(await page.evaluate(() => snap.getLayout().windows.length), 0);
    assert.deepEqual(errors, []); report.push({ version, test: "RMB three-window cascade, stable link IDs, LMB detach, resize/setting cleanup, unrelated context menu and disposal", passed: true }); await page.close();
  }
} finally { await browser.close(); await new Promise(resolve => host.close(resolve)); }
fs.writeFileSync(path.join(output, "revision-ui-check.json"), JSON.stringify({ scope: "Real templates/core CSS and module browser handlers; synthetic Foundry lifecycle", results: report }, null, 2) + "\n");
console.log(JSON.stringify({ passed: report.length, output }, null, 2));
