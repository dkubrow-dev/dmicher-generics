// Browser QA of real shared Help and Appearance code with synthetic Foundry lifecycle/data.
// Reads installed Foundry styles; never connects to a world or changes user settings.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = path.dirname(repo);
const output = path.join(workspace, "artifacts/dmicher-generics/1.0.0/shared-ui-preview");
fs.mkdirSync(output, { recursive: true });
const require = createRequire(import.meta.url);
const runtimeModules = process.env.CODEX_NODE_MODULES ?? path.join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules");
const { chromium } = require(path.join(runtimeModules, "playwright"));
const host = http.createServer((request, response) => {
  const route = decodeURIComponent((request.url ?? "/").split("?")[0]);
  if (route === "/") return response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end('<!doctype html><html><head><meta charset="utf-8"></head><body class="game theme-dark"></body></html>');
  let filename;
  const module = /^\/modules\/(dmicher-(?:generics|master-screen|spotlight-tools))\/(.+)$/.exec(route);
  if (module) {
    const root = path.join(workspace, module[1], module[1]);
    const candidate = path.resolve(root, module[2]);
    if (candidate.startsWith(root + path.sep)) filename = candidate;
  } else if (route === "/handlebars.js") filename = "E:/Foundry Portable/Foundry VTT 14.366/App/resources/app/node_modules/handlebars/dist/handlebars.js";
  else if (/^\/core\/(13\.351|14\.366)\.css$/.test(route)) filename = `E:/Foundry Portable/Foundry VTT ${route.slice(6, -4)}/App/resources/app/public/css/foundry2.css`;
  if (!filename || !fs.existsSync(filename)) return response.writeHead(404).end();
  const type = filename.endsWith(".css") ? "text/css" : filename.endsWith(".js") ? "text/javascript" : "text/plain";
  response.writeHead(200, { "Content-Type": `${type}; charset=utf-8` }); fs.createReadStream(filename).pipe(response);
});
await new Promise(resolve => host.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${host.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXE ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const report = [];
try {
  for (const version of ["13.351", "14.366"]) for (const language of ["ru", "en"]) for (const theme of ["dark", "light"]) {
    const page = await browser.newPage({ viewport: { width: 760, height: 660 } });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(base);
    for (const url of [`${base}/core/${version}.css`, `${base}/modules/dmicher-generics/styles/dmicher-generics.css`, `${base}/modules/dmicher-generics/styles/help.css`, `${base}/modules/dmicher-generics/styles/appearance.css`]) await page.addStyleTag({ url });
    await page.addStyleTag({ content: "body{font-family:Arial,sans-serif;background:#35433e;width:100%;height:100%}.application{position:fixed;top:16px;left:16px;margin:0}.window-content{min-height:0}.qa-setting{position:fixed;bottom:4px;right:4px;padding:4px;background:#ddd;color:#111;z-index:10000}.qa-setting a{color:#111}.dmicher-setting-help i::before{content:'?';font:bold 15px Arial}.window-title{font-family:Arial,sans-serif}" });
    await page.addScriptTag({ url: `${base}/handlebars.js` });
    const dictionary = JSON.parse(fs.readFileSync(path.join(workspace, `dmicher-spotlight-tools/dmicher-spotlight-tools/lang/${language}.json`), "utf8")).DMICHERSPOTLIGHTTOOLS;
    await page.evaluate(async ({ language, theme, dictionary }) => {
      window.game = { i18n: { lang: language }, user: { id: "qa", isGM: true }, settings: {} };
      const hooks = new Map(); let nextHook = 0;
      window.Hooks = { on(name, fn) { const id = ++nextHook; hooks.set(id, { name, fn }); return id; }, once(name, fn) { return this.on(name, fn); }, off(name, id) { hooks.delete(id); }, callAll(name, ...args) { for (const hook of hooks.values()) if (hook.name === name) hook.fn(...args); } };
      const settings = new Map();
      game.settings = { register(id, key, options) { if (!settings.has(key)) settings.set(key, options.default); }, registerMenu() {}, get: (id, key) => settings.get(key), set: async (id, key, value) => settings.set(key, value) };
      settings.set("theme", theme);
      window.ui = { notifications: { error: message => { throw Error(message); }, info() {} }, windows: {} };
      class App {
        constructor(options = {}) { this.options = { ...this.constructor.DEFAULT_OPTIONS, ...options }; this.rendered = false; this.position = this.options.position ?? {}; this.pending = Promise.resolve(); }
        async _prepareContext() { return {}; }
        async _onRender() {}
        async _onClose() {}
        bringToFront() {}
        async _renderHTML(context) {
          const template = Object.values(this.constructor.PARTS)[0].template;
          return Handlebars.compile(await (await fetch(`/${template}`)).text())(context);
        }
        _replaceHTML(result, content) { content.innerHTML = result; }
        render() {
          this.pending = this.pending.then(async () => {
            if (!this.element) {
              this.element = document.createElement("section"); this.element.id = this.options.id; this.element.className = ["application", ...this.options.classes].join(" ");
              this.element.dataset.dmicherTheme = theme;
              this.element.style.width = `${Math.min(Number(this.position.width) || 620, innerWidth - 32)}px`;
              this.element.style.height = `${Math.min(Number(this.position.height) || 625, innerHeight - 32)}px`;
              this.element.innerHTML = '<header class="window-header"><h1 class="window-title"></h1></header><div class="window-content"></div>';
              document.body.append(this.element);
            }
            this.rendered = true; foundry.applications.instances.set(this.options.id, this);
            this.element.querySelector(".window-title").textContent = this.title;
            const context = await this._prepareContext({});
            this._replaceHTML(await this._renderHTML(context), this.element.querySelector(".window-content"));
            await this._onRender(context, {}); Hooks.callAll("renderApplicationV2", this, this.element);
            return this;
          });
          return this.pending;
        }
        async close() { await this.pending; await this._onClose({}); this.element?.remove(); this.element = null; this.rendered = false; foundry.applications.instances.delete(this.options.id); }
      }
      window.foundry = { applications: { instances: new Map(), api: { ApplicationV2: App, HandlebarsApplicationMixin: base => base } } };
      const help = await import("/modules/dmicher-generics/scripts/help/index.js");
      const spot = await import("/modules/dmicher-spotlight-tools/scripts/tools/requests/request-help-content.js");
      const screen = await import("/modules/dmicher-master-screen/scripts/help-content.js");
      const generic = await import("/modules/dmicher-generics/scripts/appearance-content.js");
      window.help = help;
      window.providers = {
        spotlight: { content: () => spot.buildSpotlightHelp({ language, localize: key => key.split(".").reduce((value, part) => value?.[part], dictionary) ?? key }), entries: () => spot.getSettingHelpEntries(language) },
        screen: { content: () => screen.getScreenHelpContent(language), entries: () => screen.getScreenSettingHelp(language) },
        generics: { content: generic.appearanceHelpContent, entries: () => [{ selector: '[name="snapCenters"]', pageId: "settings", anchor: "snapCenters", hint: generic.appearanceText().snapCentersHint }] }
      };
      window.openProvider = async name => {
        await window.currentHelp?.close(); window.settingDisposer?.(); document.querySelector(".qa-setting")?.remove();
        const provider = providers[name]; const content = help.normalizeHelpContent(provider.content());
        const Help = help.createHelpApplication({ id: `qa-help-${name}`, title: `${name} help`, getContent: provider.content });
        window.currentHelp = new Help(); await currentHelp.render();
        const entry = provider.entries().find(entry => entry.anchor && content.pages.get(entry.pageId)?.html.includes(`id="${entry.anchor}"`));
        if (!entry) throw Error(`No setting anchor for ${name}`);
        const fixture = document.createElement("div"); fixture.className = "qa-setting";
        fixture.innerHTML = '<fieldset disabled><label>QA setting <input type="checkbox" checked></label></fieldset>';
        const nameMatch = /name="([^"]+)"/.exec(entry.selector); fixture.querySelector("input").name = nameMatch?.[1] ?? "qa";
        document.body.append(fixture);
        window.settingDisposer = help.bindSettingHelp(fixture, { entries: [{ ...entry, selector: "input" }], tabIndex: name === "screen" ? -1 : 0, open: (...args) => currentHelp.navigate(...args) });
        return { entry, pages: content.pages.size };
      };
      let active = false; const subscribers = new Set();
      window.fakePremium = { forModule: () => ({ invoke: (name, args, baseline) => active ? args[0] : baseline(), getStatus: () => ({ active }), subscribe: fn => { subscribers.add(fn); return () => subscribers.delete(fn); } }), setActive(value) { active = value; for (const fn of subscribers) fn(); } };
      const { createAppearanceController } = await import("/modules/dmicher-generics/scripts/appearance.js");
      window.appearance = createAppearanceController({ premium: fakePremium, help }); appearance.registerSettings(); appearance.install();
    }, { language, theme, dictionary });
    for (const name of ["spotlight", "screen", "generics"]) {
      const { entry, pages } = await page.evaluate(name => openProvider(name), name);
      await page.waitForTimeout(25);
      const layout = await page.evaluate(() => {
        const root = currentHelp.element, nav = root.querySelector("nav"), footer = root.querySelector(".dmicher-help-footer");
        const article = root.querySelector(".dmicher-help-page");
        return { overflow: root.scrollWidth > root.clientWidth || article.scrollWidth > article.clientWidth, footer: [...footer.querySelectorAll("button")].map(button => button.dataset.helpPage),
          footerBottom: footer.getBoundingClientRect().bottom, navBottom: nav.getBoundingClientRect().bottom,
          labels: [...root.querySelectorAll("nav,[role=separator]")].map(el => el.getAttribute("aria-label")) };
      });
      assert.equal(layout.overflow, false); assert.deepEqual(layout.footer, ["author", "thanks", "modules"]);
      assert.ok(layout.footerBottom <= layout.navBottom && layout.footerBottom > layout.navBottom - 20);
      assert.ok(layout.labels.every(Boolean), `${name} missing navigation labels`);
      const internal = page.locator(".dmicher-help-page a[data-help-page]").first();
      if (await internal.count()) {
        const targetPage = await internal.getAttribute("data-help-page");
        assert.equal(await internal.getAttribute("href"), "#");
        await internal.focus(); await page.keyboard.press("Enter");
        await page.waitForFunction(pageId => currentHelp.activePage === pageId, targetPage);
        await page.evaluate(() => currentHelp.pending);
      }
      const question = page.locator(".qa-setting .dmicher-setting-help");
      assert.equal(await question.getAttribute("tabindex"), name === "screen" ? "-1" : "0");
      assert.equal(await question.getAttribute("title"), entry.hint);
      await question.click(); await page.waitForFunction(pageId => currentHelp.activePage === pageId, entry.pageId);
      await page.evaluate(() => currentHelp.pending);
      assert.equal(await page.locator(".qa-setting input").isChecked(), true);
      const target = await page.locator(`.dmicher-help-page [id="${entry.anchor}"]`).boundingBox();
      const article = await page.locator(".dmicher-help-page").boundingBox();
      assert.ok(target.y >= article.y - 2 && target.y < article.y + article.height, `${name} did not scroll to ${entry.anchor}`);
      const divider = await page.locator(".dmicher-help-divider").boundingBox();
      await page.mouse.move(divider.x + 3, divider.y + 25); await page.mouse.down(); await page.mouse.move(divider.x + 63, divider.y + 25); await page.mouse.up();
      assert.equal(await page.evaluate(() => currentHelp.navigationWidth), 290);
      await page.locator(".dmicher-help-divider").focus(); await page.keyboard.press("Home");
      assert.equal(await page.evaluate(() => currentHelp.navigationWidth), 140);
      await page.locator('[data-help-page="modules"]').click(); await page.evaluate(() => currentHelp.pending);
      assert.equal(await page.evaluate(() => currentHelp.activePage), "modules");
      const settingState = await page.evaluate(() => { settingDisposer(); return document.querySelectorAll(".qa-setting .dmicher-setting-help").length; });
      assert.equal(settingState, 0);
      await page.evaluate(async () => { document.querySelector(".qa-setting")?.remove(); currentHelp.navigationWidth = 230; await currentHelp.navigate(currentHelp.options.id.endsWith("screen") ? "constructor" : currentHelp.options.id.endsWith("generics") ? "settings" : "overview"); });
      assert.equal(await page.evaluate(() => { const article = currentHelp.element.querySelector(".dmicher-help-page"); return article.scrollWidth > article.clientWidth; }), false, `${name} article scrolls horizontally`);
      const codeBoxes = name === "screen" ? await page.locator(".dmicher-help-page code").evaluateAll(nodes => nodes.map(node => {
        const style = getComputedStyle(node), rect = node.getBoundingClientRect();
        return { text: node.textContent, display: style.display, lineHeight: style.lineHeight, fontSize: style.fontSize,
          fontFamily: style.fontFamily, height: rect.height, overflow: style.overflow, clipPath: style.clipPath,
          padding: style.padding, parentOverflow: getComputedStyle(node.parentElement).overflow };
      })) : undefined;
      if (version === "14.366") await page.screenshot({ path: path.join(output, `${name}-help-${language}-${theme}.png`) });
      report.push({ version, language, theme, surface: `${name}-help`, pages, passed: true, codeBoxes });
    }
    await page.evaluate(async () => { await currentHelp.close(); window.settingsApp = appearance.openSettings(); await settingsApp.pending; });
    assert.equal(await page.locator('[name="customStyles"]').isDisabled(), true);
    await page.locator('[name="snapScreen"]').uncheck(); await page.locator('[name="snapWindows"]').uncheck();
    assert.equal(await page.locator('[name="snapCorners"]').isDisabled(), true);
    assert.equal(await page.locator('[name="snapCenters"]').isDisabled(), true);
    await page.locator('[name="snapScreen"]').check(); assert.equal(await page.locator('[name="snapCenters"]').isEnabled(), true);
    if (version === "14.366") await page.screenshot({ path: path.join(output, `appearance-settings-${language}-${theme}.png`) });
    await page.locator('[data-dmicher-setting-help="settings#snapCenters"]').click();
    await page.waitForSelector(".dmicher-generics-help #snapCenters");
    await page.evaluate(async () => { for (const app of [...foundry.applications.instances.values()]) if (app !== settingsApp) await app.close(); fakePremium.setActive(true); });
    assert.equal(await page.locator('[name="customStyles"]').isEnabled(), true);
    await page.locator('[name="customStyles"]').setInputFiles({ name: "qa.css", mimeType: "text/css", buffer: Buffer.from(".window-content { border-left: 3px solid rgb(120, 80, 40); }") });
    await page.waitForFunction(() => settingsApp.customDraft?.includes("border-left"));
    await page.locator('button[type="submit"]').click(); await page.waitForFunction(() => !settingsApp.busy && game.settings.get("dmicher-generics", "customStyles"));
    assert.equal(await page.evaluate(() => settingsApp.rendered), true, "Save must leave the appearance form open");
    assert.equal(await page.locator('[name="snapScreen"]').isChecked(), true);
    assert.equal(await page.locator('[name="snapWindows"]').isChecked(), false);
    assert.equal(await page.locator('[name="snapCascadeRightButton"]').isChecked(), true);
    assert.deepEqual(await page.evaluate(() => [game.settings.get("dmicher-generics", "snapScreen"), game.settings.get("dmicher-generics", "snapWindows")]), [true, false]);
    assert.ok(await page.locator("style[data-dmicher-custom-style]").textContent());
    // Delay a real Save handler, then edit the still-open form while it is writing.
    await page.evaluate(() => {
      const set = game.settings.set; let release; const wait = new Promise(resolve => release = resolve);
      window.releaseSave = () => { game.settings.set = set; release(); };
      game.settings.set = async (...args) => { if (args[1] === "theme") await wait; return set(...args); };
    });
    await page.locator('button[type="submit"]').click(); await page.waitForFunction(() => settingsApp.busy);
    await page.locator('[name="snapWindows"]').check();
    await page.locator('[name="customStyles"]').setInputFiles({ name: "next.css", mimeType: "text/css", buffer: Buffer.from(".window-content { border-right: 2px solid blue; }") });
    await page.waitForFunction(() => settingsApp.customDraft?.includes("border-right"));
    await page.evaluate(() => releaseSave()); await page.waitForFunction(() => !settingsApp.busy);
    assert.equal(await page.locator('[name="snapWindows"]').isChecked(), true, "Edits made while saving must remain in the form");
    assert.equal(await page.evaluate(() => game.settings.get("dmicher-generics", "snapWindows")), false, "The first Save writes its own snapshot");
    assert.ok(await page.evaluate(() => settingsApp.customDraft.includes("border-right")), "A newer CSS draft must survive a pending Save");
    await page.locator('button[type="submit"]').click(); await page.waitForFunction(() => !settingsApp.busy && game.settings.get("dmicher-generics", "snapWindows"));
    assert.ok(await page.evaluate(() => game.settings.get("dmicher-generics", "customStyles").includes("border-right")));
    assert.equal(await page.evaluate(() => settingsApp.rendered), true);
    await page.evaluate(() => fakePremium.setActive(false)); assert.equal(await page.locator("style[data-dmicher-custom-style]").count(), 0);
    await page.evaluate(() => fakePremium.setActive(true)); assert.equal(await page.locator("style[data-dmicher-custom-style]").count(), 1);
    await page.evaluate(() => appearance.dispose());
    assert.equal(errors.length, 0, errors.join("\n"));
    report.push({ version, language, theme, surface: "appearance-settings", passed: true });
    await page.close();
  }
} finally { await browser.close(); await new Promise(resolve => host.close(resolve)); }
fs.writeFileSync(path.join(output, "shared-ui-check.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ passed: report.length, output }, null, 2));
