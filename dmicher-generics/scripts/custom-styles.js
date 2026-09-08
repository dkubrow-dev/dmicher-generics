export const MAX_CUSTOM_STYLE_BYTES = 65_536;

// Include the scope root when a stylesheet addresses its class explicitly.
// CSS @scope otherwise treats a normal selector as a descendant selector.
function scopedSelectors(text) {
  const selectors = []; let start = 0, depth = 0, quote = "", escaped = false;
  for (let index = 0; index <= text.length; index++) {
    const char = text[index];
    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }
    if (quote) { if (char === quote) quote = ""; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "(" || char === "[") depth++;
    if (char === ")" || char === "]") depth--;
    if ((char === "," && depth === 0) || index === text.length) { selectors.push(text.slice(start, index).trim()); start = index + 1; }
  }
  return selectors.flatMap((selector) => {
    let boundary = selector.length; depth = 0; quote = ""; escaped = false;
    for (let index = 0; index < selector.length; index++) {
      const char = selector[index];
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (quote) { if (char === quote) quote = ""; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === "(" || char === "[") depth++;
      if (char === ")" || char === "]") depth--;
      if (depth === 0 && /[\s>+~]/.test(char)) { boundary = index; break; }
    }
    return [selector, `:scope:is(${selector.slice(0, boundary)})${selector.slice(boundary)}`];
  }).join(", ");
}

/** Parse before wrapping so an unmatched brace cannot escape the window scope. */
export function prepareCustomStyles(css, document = globalThis.document) {
  if (typeof css !== "string" || new TextEncoder().encode(css).length > MAX_CUSTOM_STYLE_BYTES) {
    throw new TypeError("Invalid custom style size.");
  }
  if (!css.trim()) return "";
  const view = document?.defaultView ?? globalThis;
  if (typeof view.CSSStyleSheet !== "function" || typeof view.CSSScopeRule !== "function") {
    throw new Error("Scoped styles are not supported by this browser.");
  }
  // replaceSync silently discards imports, so reject them before parsing.
  if (/@import\b/i.test(css)) throw new TypeError("External CSS imports are unsupported.");
  const sheet = new view.CSSStyleSheet();
  sheet.replaceSync(css);
  const validate = (rules) => {
    for (const rule of rules) {
      if (rule instanceof view.CSSStyleRule) {
        if (rule.cssRules?.length) throw new TypeError("Nested style rules are unsupported.");
        rule.selectorText = scopedSelectors(rule.selectorText);
        continue;
      }
      if (rule instanceof view.CSSMediaRule || rule instanceof view.CSSSupportsRule) { validate(rule.cssRules); continue; }
      throw new TypeError("Only style, media and supports rules are supported.");
    }
  };
  validate(sheet.cssRules);
  if (!sheet.cssRules.length) throw new TypeError("The stylesheet has no supported rules.");
  return `@scope (.dmicher-window) {\n${Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n")}\n}`;
}
