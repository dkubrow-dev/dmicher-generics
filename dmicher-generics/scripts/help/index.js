import { escapeHTML } from "../utilities.js";
import { getRenderedElement, runAfterApplicationLifecycle } from "../windows.js";

const FOOTER_IDS = Object.freeze(["author", "thanks", "modules"]);
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

/** Consumer-owned, trusted help content. This API does not load or execute page scripts. */
export function normalizeHelpContent(content) {
  const pages = new Map();
  for (const page of content?.pages ?? []) {
    if (typeof page.id !== "string" || !identifier.test(page.id) || pages.has(page.id)) throw new Error(`Invalid or duplicate help page: ${page.id}`);
    pages.set(page.id, { ...page, title: String(page.title ?? page.id), html: String(page.html ?? "") });
  }
  if (!pages.size) throw new Error("Help requires at least one page");
  const footer = content.footer ?? FOOTER_IDS;
  if (!Array.isArray(footer) || footer.length !== 3 || FOOTER_IDS.some((id, index) => footer[index] !== id || !pages.has(id))) {
    throw new Error("Help requires consumer-owned author, thanks and modules footer pages");
  }
  const seen = new Set();
  const visit = (nodes) => (nodes ?? []).map((node) => {
    if (typeof node.id !== "string" || !identifier.test(node.id) || seen.has(node.id)) throw new Error(`Invalid or duplicate help navigation: ${node.id}`);
    seen.add(node.id);
    if (node.pageId && (!pages.has(node.pageId) || footer.includes(node.pageId))) throw new Error(`Invalid help navigation page: ${node.pageId}`);
    return { id: node.id, title: String(node.title ?? node.id), pageId: node.pageId, children: visit(node.children) };
  });
  return { pages, tree: visit(content.tree), footer, labels: content.labels ?? {} };
}

export function clampNavigationWidth(width, availableWidth = 920) {
  return Math.max(140, Math.min(Number(width) || 230, 420, Math.max(140, availableWidth - 260)));
}

function containsPage(node, pageId) {
  return node.pageId === pageId || node.children.some((child) => containsPage(child, pageId));
}

function pageLink(page, activePage, title = page.title) {
  return `<button type="button" data-help-page="${escapeHTML(page.id)}" class="dmicher-help-link${page.id === activePage ? " active" : ""}"${page.id === activePage ? ' aria-current="page"' : ""}>${escapeHTML(title)}</button>`;
}

export function renderHelpLayout(content, activePage, { expanded = new Set(), navigationWidth = 230 } = {}) {
  const page = content.pages.get(activePage) ?? content.pages.values().next().value;
  const renderNodes = (nodes) => nodes.map((node) => {
    const link = node.pageId ? pageLink(content.pages.get(node.pageId), page.id, node.title) : "";
    if (!node.children.length) return link;
    const open = expanded.has(node.id) || containsPage(node, page.id);
    return `<details data-help-group="${escapeHTML(node.id)}"${open ? " open" : ""}><summary>${escapeHTML(node.title)}</summary>${link}<div class="dmicher-help-children">${renderNodes(node.children)}</div></details>`;
  }).join("");
  return `<div class="dmicher-help-layout" style="--dmicher-help-nav-width:${clampNavigationWidth(navigationWidth)}px">
    <nav class="dmicher-help-navigation" aria-label="${escapeHTML(content.labels.contents ?? "")}">
      <div class="dmicher-help-tree">${renderNodes(content.tree)}</div>
      <div class="dmicher-help-footer">${content.footer.map((id) => pageLink(content.pages.get(id), page.id)).join("")}</div>
    </nav>
    <div class="dmicher-help-divider" role="separator" tabindex="0" aria-orientation="vertical" aria-label="${escapeHTML(content.labels.resizeNavigation ?? "")}" aria-valuemin="140" aria-valuemax="420" aria-valuenow="${clampNavigationWidth(navigationWidth)}"></div>
    <article class="dmicher-help-page" tabindex="-1"><h1>${escapeHTML(page.title)}</h1>${page.html}</article>
  </div>`;
}

/** Lazy factory: importing the shared API does not require Foundry to be initialized. */
export function createHelpApplication({ id, title, classes = [], getContent, initialPageId } = {}) {
  if (!id || typeof getContent !== "function") throw new TypeError("Help requires id and getContent");
  const { ApplicationV2 } = foundry.applications.api;
  return class DmicherHelpApplication extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id, classes: [...new Set(["dmicher-window", "dmicher-help", ...classes])],
      position: { width: 920, height: 700 },
      window: { icon: "fa-solid fa-circle-question", resizable: true }
    };

    constructor(options = {}) {
      super(options);
      this.activePage = initialPageId;
      this.navigationWidth = 230;
      this.expanded = new Set();
    }

    get title() { return typeof title === "function" ? title() : String(title ?? ""); }

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      this.helpContent = normalizeHelpContent(await getContent());
      if (!this.helpContent.pages.has(this.activePage)) this.activePage = this.helpContent.pages.keys().next().value;
      return { ...context, helpHTML: renderHelpLayout(this.helpContent, this.activePage, this) };
    }

    async _renderHTML(context) {
      const root = (this.element?.ownerDocument ?? document).createElement("div");
      root.className = "dmicher-help-root";
      root.innerHTML = context.helpHTML;
      return root;
    }

    _replaceHTML(result, content) { content.replaceChildren(result); }

    _onRender(context, options) {
      return runAfterApplicationLifecycle(super._onRender(context, options), () => {
        this.helpListeners?.abort();
        this.helpResizeObserver?.disconnect();
        const root = getRenderedElement(this.element);
        const view = root.ownerDocument.defaultView;
        this.helpListeners = new view.AbortController();
        const { signal } = this.helpListeners;
        for (const link of root.querySelectorAll("a[data-help-page]")) {
          if (!link.hasAttribute("href")) link.setAttribute("href", "#");
        }
        root.addEventListener("click", (event) => {
          const link = event.target.closest?.("[data-help-page]");
          if (link && root.contains(link)) {
            event.preventDefault(); event.stopPropagation();
            void this.navigate(link.dataset.helpPage, link.dataset.helpAnchor);
          }
        }, { signal });
        root.querySelectorAll("details[data-help-group]").forEach((group) => {
          group.addEventListener("toggle", () => {
            if (group.open) this.expanded.add(group.dataset.helpGroup);
            else this.expanded.delete(group.dataset.helpGroup);
          }, { signal });
        });
        const layout = root.querySelector(".dmicher-help-layout");
        const divider = root.querySelector(".dmicher-help-divider");
        const applyWidth = (width) => {
          this.navigationWidth = clampNavigationWidth(width, layout.clientWidth);
          layout.style.setProperty("--dmicher-help-nav-width", `${this.navigationWidth}px`);
          divider.setAttribute("aria-valuenow", String(this.navigationWidth));
        };
        applyWidth(this.navigationWidth);
        if (view.ResizeObserver) {
          this.helpResizeObserver = new view.ResizeObserver(() => applyWidth(this.navigationWidth));
          this.helpResizeObserver.observe(layout);
        }
        divider.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          event.preventDefault(); event.stopPropagation();
          divider.setPointerCapture(event.pointerId);
          this.navigationDrag = { id: event.pointerId, x: event.clientX, width: this.navigationWidth };
        }, { signal });
        divider.addEventListener("pointermove", (event) => {
          const drag = this.navigationDrag;
          if (drag?.id === event.pointerId) applyWidth(drag.width + event.clientX - drag.x);
        }, { signal });
        for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
          divider.addEventListener(name, () => { this.navigationDrag = null; }, { signal });
        }
        divider.addEventListener("keydown", (event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          applyWidth(event.key === "Home" ? 140 : event.key === "End" ? 420 : this.navigationWidth + (event.key === "ArrowLeft" ? -10 : 10));
        }, { signal });
        const article = root.querySelector(".dmicher-help-page");
        const target = this.pendingAnchor && [...article.querySelectorAll("[id]")].find((element) => element.id === this.pendingAnchor);
        if (target) target.scrollIntoView({ block: "start" });
        else article.scrollTop = 0;
        this.pendingAnchor = null;
      });
    }

    async navigate(pageId, anchor) {
      const content = normalizeHelpContent(await getContent());
      if (!content.pages.has(pageId)) return false;
      this.activePage = pageId;
      this.pendingAnchor = typeof anchor === "string" ? anchor : null;
      await this.render({ force: true });
      this.bringToFront();
      return true;
    }

    _onClose(options) {
      this.helpListeners?.abort();
      this.helpResizeObserver?.disconnect();
      this.navigationDrag = null;
      return super._onClose(options);
    }
  };
}

/** Adds contextual help without changing a setting value or claiming its permissions. */
export function bindSettingHelp(html, { open, entries = [], tabIndex = 0 } = {}) {
  const root = getRenderedElement(html);
  if (!root || typeof open !== "function") return () => {};
  const created = [];
  for (const entry of entries) {
    for (const input of root.querySelectorAll(entry.selector)) {
      const control = input.matches('button, [role="button"], input[type="button"], input[type="submit"]') ? input
        : input.closest('label[role="button"], label[data-dmicher-help-overlay]');
      // A parameter table labels the value through its own row header. Keep help
      // with that caption; appending it to the value cell would add another line.
      const rowCaption = input.closest("td")?.parentElement?.querySelector(':scope > th[scope="row"]');
      let container = control?.parentElement?.classList.contains("dmicher-setting-help-control") ? control.parentElement
        : control ?? input.closest("label") ?? input.closest(".form-group")?.querySelector("label") ?? input.parentElement?.querySelector(":scope > label") ?? rowCaption ?? input.parentElement;
      if (!container) continue;
      const key = `${entry.pageId}#${entry.anchor ?? ""}`;
      if ([...container.querySelectorAll("[data-dmicher-setting-help]")].some((button) => button.dataset.dmicherSettingHelp === key)) continue;
      let wrapper;
      if (control && container === control) {
        wrapper = root.ownerDocument.createElement("span"); wrapper.className = "dmicher-setting-help-control";
        const style = root.ownerDocument.defaultView.getComputedStyle(control);
        wrapper.style.flex = style.flex;
        control.before(wrapper); wrapper.append(control); container = wrapper;
      }
      // A link remains usable inside a disabled fieldset, so locked settings still explain themselves.
      const button = root.ownerDocument.createElement("a");
      button.href = "#";
      button.setAttribute("role", "button");
      button.setAttribute("tabindex", tabIndex === -1 ? "-1" : "0");
      button.className = "dmicher-setting-help";
      if (control) button.classList.add("dmicher-setting-help-overlay");
      button.dataset.dmicherSettingHelp = key;
      button.title = String(entry.hint ?? "");
      button.setAttribute("aria-label", String(entry.label ?? entry.hint ?? entry.pageId));
      button.innerHTML = '<i class="fa-solid fa-circle-question" aria-hidden="true"></i>';
      const listener = (event) => {
        event.preventDefault(); event.stopPropagation();
        void open(entry.pageId, entry.anchor);
      };
      button.addEventListener("click", listener);
      const keyListener = (event) => { if (event.key === " ") listener(event); };
      button.addEventListener("keydown", keyListener);
      const stopPointer = (event) => { event.preventDefault(); event.stopPropagation(); };
      button.addEventListener("pointerdown", stopPointer);
      if (control) {
        container.append(button);
        created.push({ button, listener, keyListener, stopPointer, wrapper, control });
        continue;
      }
      let caption = [...container.children].find((child) => child.tagName === "SPAN" && !child.querySelector("input,select,textarea,button"));
      if (!caption) {
        const textNodes = [...container.childNodes].filter((node) => node.nodeType === 3 && node.textContent.trim());
        if (textNodes.length) {
          caption = root.ownerDocument.createElement("span");
          container.insertBefore(caption, textNodes[0]);
          for (const node of textNodes) caption.append(node);
        }
      }
      if (caption) caption.append(button);
      else container.append(button);
      created.push({ button, listener, keyListener, stopPointer });
    }
  }
  return () => { for (const { button, listener, keyListener, stopPointer, wrapper, control } of created.splice(0)) {
    button.removeEventListener("click", listener); button.removeEventListener("keydown", keyListener); button.removeEventListener("pointerdown", stopPointer); button.remove();
    if (wrapper?.parentElement && wrapper.contains(control)) { wrapper.before(control); wrapper.remove(); }
  } };
}
