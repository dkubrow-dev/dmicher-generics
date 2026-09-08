import test from "node:test";
import assert from "node:assert/strict";
import { renderChatPortrait } from "../dmicher-generics/scripts/chat/portraits.js";

function fixture() {
  let current;
  const document = { createElement(tag) {
    const media = { tagName: tag.toUpperCase(), ownerDocument: document, dataset: {}, attributes: new Set(),
      handlers: new Set(), className: "avatar-image",
      toggleAttribute(attribute) { this.attributes.add(attribute); },
      addEventListener(event, handler) { assert.equal(event, "error"); this.handlers.add(handler); },
      removeEventListener(event, handler) { assert.equal(event, "error"); this.handlers.delete(handler); },
      replaceWith(replacement) { current = replacement; },
      error() { for (const handler of [...this.handlers]) handler(); }
    };
    return media;
  } };
  current = document.createElement("img");
  const root = { nodeType: 1, ownerDocument: document, querySelector: () => current };
  return { root, portrait: () => current, render: (options = {}) => renderChatPortrait(root, {
    moduleId: "dmicher-test", sources: ["actor.webm", "user.webp", "default.svg"], alt: "Actor", ...options
  }) };
}

test("portrait uses its own DOM realm and preserves layout through finite image/video fallbacks", () => {
  const { portrait, render } = fixture();
  render();
  assert.equal(portrait().tagName, "VIDEO");
  assert.equal(portrait().className, "avatar-image");
  assert.equal(portrait().src, "actor.webm");
  assert.equal(portrait().alt, "Actor");
  assert.equal(portrait().muted, true);
  assert.deepEqual([...portrait().attributes], ["autoplay", "muted", "disablepictureinpicture", "loop", "playsinline"]);
  portrait().error();
  assert.equal(portrait().tagName, "IMG");
  assert.equal(portrait().src, "user.webp");
  portrait().error();
  assert.equal(portrait().src, "default.svg");
  assert.equal(portrait().handlers.size, 0);
  portrait().error();
  assert.equal(portrait().src, "default.svg");
});

test("repeat renders neither retry failed media nor accumulate listeners and can update the label", () => {
  const { portrait, render } = fixture();
  const dispose = render();
  portrait().error();
  const media = portrait();
  assert.equal(render({ alt: "Renamed actor" }), dispose);
  assert.equal(portrait(), media);
  assert.equal(portrait().alt, "Renamed actor");
  assert.equal(portrait().src, "user.webp");
  assert.equal(portrait().handlers.size, 1);
  portrait().error();
  assert.equal(portrait().alt, "Renamed actor");
  assert.equal(portrait().src, "default.svg");
});

test("new source selection invalidates old error callbacks and stale disposers", () => {
  const { portrait, render } = fixture();
  const oldDispose = render();
  const oldError = [...portrait().handlers][0];
  const dispose = render({ sources: ["replacement.webp", "fallback.svg"] });
  assert.equal(oldDispose(), false);
  oldError();
  assert.equal(portrait().src, "replacement.webp");
  const pendingError = [...portrait().handlers][0];
  assert.equal(dispose(), true);
  assert.equal(dispose(), false);
  pendingError();
  assert.equal(portrait().src, "replacement.webp");
  assert.equal(portrait().handlers.size, 0);
});

test("two consumers cannot silently replace the same live portrait and separate roots stay independent", () => {
  const first = fixture(), second = fixture();
  const dispose = first.render();
  second.render({ moduleId: "dmicher-other", sources: ["other.webp"] });
  assert.throws(() => first.render({ moduleId: "dmicher-other" }), /already controlled/);
  assert.equal(first.portrait().src, "actor.webm");
  assert.equal(second.portrait().src, "other.webp");
  dispose();
  first.render({ moduleId: "dmicher-other", sources: ["selected.webp"] });
  assert.equal(first.portrait().src, "selected.webp");
});

test("empty or duplicate sources do not create unbounded retries", () => {
  const { portrait, render } = fixture();
  render({ sources: ["", "  actor.webm ", "actor.webm", null, "default.svg", "default.svg"] });
  assert.equal(portrait().src, "actor.webm");
  portrait().error();
  assert.equal(portrait().src, "default.svg");
  assert.equal(portrait().handlers.size, 0);
  const noop = renderChatPortrait(null, { moduleId: "dmicher-test", sources: [] });
  assert.equal(noop(), false);
});
