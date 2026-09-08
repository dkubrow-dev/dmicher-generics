import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHelpContent, renderHelpLayout, clampNavigationWidth, createHelpApplication } from "../dmicher-generics/scripts/help/index.js";

const content = (owner = "one") => ({
  pages: [{ id: "start", title: `${owner} <start>`, html: '<section id="setting">Steps</section>' }, { id: "author", title: "Author", html: owner }, { id: "thanks", title: "Thanks", html: owner }, { id: "modules", title: "Premium", html: owner }],
  tree: [{ id: "tasks", title: "Tasks", children: [{ id: "nested", title: "Nested", children: [{ id: "first", title: "Start", pageId: "start" }] }] }],
  footer: ["author", "thanks", "modules"], labels: { contents: "Contents", resizeNavigation: "Resize navigation" }
});

test("help requires consumer-owned footer pages and rejects broken page references", () => {
  assert.throws(() => normalizeHelpContent({ ...content(), pages: content().pages.slice(0, 3) }), /consumer-owned/);
  assert.throws(() => normalizeHelpContent({ ...content(), tree: [{ id: "bad", pageId: "missing" }] }), /navigation page/);
  assert.throws(() => normalizeHelpContent({ ...content(), pages: [...content().pages, content().pages[0]] }), /duplicate/);
  assert.throws(() => normalizeHelpContent({ ...content(), tree: [{ id: "a", pageId: "author" }] }), /navigation page/);
});

test("nested tree reveals current page, escapes labels and keeps footer outside scrolling tree", () => {
  const html = renderHelpLayout(normalizeHelpContent(content()), "start");
  assert.match(html, /data-help-group="tasks" open/);
  assert.match(html, /data-help-group="nested" open/);
  assert.match(html, /one &lt;start&gt;/);
  const footer = html.slice(html.indexOf('class="dmicher-help-footer"'));
  assert.ok(footer.indexOf('data-help-page="author"') < footer.indexOf('data-help-page="thanks"'));
  assert.ok(footer.indexOf('data-help-page="thanks"') < footer.indexOf('data-help-page="modules"'));
  assert.match(html, /role="separator" tabindex="0"/);
  assert.match(html, /<section id="setting">Steps<\/section>/);
});

test("legacy Premium footer and old deep links remain readable as the modules page", async () => {
  const old = content(); old.footer[2] = "premium"; old.pages.at(-1).id = "premium";
  const normalized = normalizeHelpContent(old);
  assert.deepEqual(normalized.footer, ["author", "thanks", "modules"]);
  assert.equal(normalized.pages.get("modules").html, "one");
  class Application { async render() { return this; } bringToFront() {} }
  const previous = globalThis.foundry;
  globalThis.foundry = { applications: { api: { ApplicationV2: Application } } };
  try {
    const Help = createHelpApplication({ id: "legacy", getContent: () => content() });
    const help = new Help(); assert.equal(await help.navigate("premium"), true); assert.equal(help.activePage, "modules");
  } finally { globalThis.foundry = previous; }
});

test("navigation bounds preserve room for content in a narrow window", () => {
  assert.equal(clampNavigationWidth(800), 420);
  assert.equal(clampNavigationWidth(100), 140);
  assert.equal(clampNavigationWidth(400, 600), 340);
});

test("two consumers navigate independently and unknown pages do not render", async () => {
  class Application {
    async _prepareContext() { return {}; }
    async render() { this.renders = (this.renders ?? 0) + 1; await this._prepareContext({}); return this; }
    bringToFront() { this.front = true; }
  }
  globalThis.foundry = { applications: { api: { ApplicationV2: Application } } };
  const One = createHelpApplication({ id: "one", title: "One", getContent: () => content("one") });
  const Two = createHelpApplication({ id: "two", title: "Two", getContent: () => content("two") });
  const one = new One(); const two = new Two();
  assert.equal(await one.navigate("start", "setting"), true);
  assert.equal(one.pendingAnchor, "setting");
  await two.navigate("author");
  assert.equal(one.activePage, "start");
  assert.equal(two.helpContent.pages.get("author").html, "two");
  assert.equal(await one.navigate("missing"), false);
  assert.equal(one.renders, 1);
  delete globalThis.foundry;
});
