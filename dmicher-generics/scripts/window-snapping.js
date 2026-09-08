import { getRenderedElement } from "./windows.js";

export const SNAP_DISTANCE = 12;
const overlap = (a, b, c, d, gap) => a <= d + gap && b >= c - gap;
const closest = (values, value, distance) => values
  .filter((candidate) => Math.abs(candidate.value - value) <= distance)
  .sort((a, b) => Math.abs(a.value - value) - Math.abs(b.value - value))[0];

/** Coordinates always come from the original pointer delta, never the last snap. */
export function snapWindowPosition(rect, viewport, neighbors = [], settings = {}) {
  return resolveWindowSnap(rect, viewport, neighbors, settings).position;
}

export function resolveWindowSnap(rect, viewport, neighbors = [], settings = {}) {
  const { screen = true, windows = true, corners = true, centers = true, distance = SNAP_DISTANCE } = settings;
  const { left, top, width, height } = rect;
  const xs = [], ys = [];
  if (screen) {
    xs.push({ value: 0, target: viewport }, { value: viewport.width - width, target: viewport });
    ys.push({ value: 0, target: viewport }, { value: viewport.height - height, target: viewport });
  }
  if (windows) for (const neighbor of neighbors) {
    if (overlap(top, top + height, neighbor.top, neighbor.top + neighbor.height, distance)) {
      xs.push({ value: neighbor.left - width, target: neighbor }, { value: neighbor.left + neighbor.width, target: neighbor });
    }
    if (overlap(left, left + width, neighbor.left, neighbor.left + neighbor.width, distance)) {
      ys.push({ value: neighbor.top - height, target: neighbor }, { value: neighbor.top + neighbor.height, target: neighbor });
    }
  }
  const x = closest(xs, left, distance), y = closest(ys, top, distance);
  if (!x && !y) return { position: { left, top }, targetId: null };
  // Choose one adjacent edge; only then align the other axis against that target.
  const horizontal = Boolean(x && (!y || Math.abs(x.value - left) <= Math.abs(y.value - top)));
  const target = horizontal ? x.target : y.target;
  const targetStart = horizontal ? target.top ?? 0 : target.left ?? 0;
  const targetSize = horizontal ? target.height : target.width;
  const size = horizontal ? height : width;
  const alignments = [];
  if (corners) alignments.push({ value: targetStart }, { value: targetStart + targetSize - size });
  if (centers) alignments.push({ value: targetStart + (targetSize - size) / 2 });
  const alignment = closest(alignments, horizontal ? top : left, distance);
  return { position: horizontal ? { left: x.value, top: alignment?.value ?? top }
    : { left: alignment?.value ?? left, top: y.value }, targetId: target.id ?? null };
}

const bounds = (element) => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};
const adjacent = (a, b) => (Math.min(Math.abs(a.left + a.width - b.left), Math.abs(b.left + b.width - a.left)) <= 1
  && overlap(a.top, a.top + a.height, b.top, b.top + b.height, 1))
  || (Math.min(Math.abs(a.top + a.height - b.top), Math.abs(b.top + b.height - a.top)) <= 1
  && overlap(a.left, a.left + a.width, b.left, b.left + b.width, 1));

export function collectLinkedWindowIds(links, id) {
  const seen = new Set(), pending = [id];
  while (pending.length) {
    const next = pending.pop(); if (seen.has(next)) continue; seen.add(next);
    for (const neighbor of links.get(next) ?? []) pending.push(neighbor);
  }
  return [...seen];
}

/** Native Foundry owns left dragging. Right dragging moves an explicitly linked component. */
export function createWindowSnapController({ getSettings }) {
  const records = new Map(), byId = new Map(), links = new Map();
  const hooks = []; let active = null;
  const unlink = (id) => {
    for (const other of links.get(id) ?? []) links.get(other)?.delete(id);
    links.delete(id);
  };
  const connect = (a, b) => {
    if (!a || !b || a === b) return;
    if (!links.has(a)) links.set(a, new Set()); if (!links.has(b)) links.set(b, new Set());
    links.get(a).add(b); links.get(b).add(a);
  };
  const cascade = (id) => collectLinkedWindowIds(links, id).map((key) => byId.get(key)).filter(Boolean);
  function refresh() {
    const settings = getSettings();
    if (!settings.windows) links.clear();
    if (active?.right && (!settings.windows || settings.cascadeRightButton === false)) active.stop();
    for (const record of [...records.values()]) {
      const { element } = record;
      if (!element.isConnected || element.dataset.dmicherDocked === "true" || element.ownerDocument.defaultView?.closed) {
        unlink(record.id); if (active?.members.includes(record)) active.stop(); continue;
      }
      const current = bounds(element);
      if (element.ownerDocument !== record.document || current.width !== record.size.width || current.height !== record.size.height) {
        unlink(record.id); if (active?.members.includes(record)) active.stop();
        record.document = element.ownerDocument; record.size = current;
      }
    }
    for (const [id, neighbors] of links) for (const otherId of [...neighbors]) {
      const a = byId.get(id), b = byId.get(otherId);
      if (!a || !b || a.document !== b.document || (!active && !adjacent(bounds(a.element), bounds(b.element)))) {
        neighbors.delete(otherId); links.get(otherId)?.delete(id);
      }
    }
  }
  function bind(application, html) {
    const element = getRenderedElement(application) ?? getRenderedElement(html);
    if (!element?.classList?.contains("dmicher-window") || typeof application?.setPosition !== "function") return;
    if (records.get(application)?.element === element) { refresh(); return; }
    records.get(application)?.dispose();
    const id = String(application.id ?? application.options?.id ?? element.id ?? "");
    if (!id || byId.has(id)) return;
    const record = { id, application, element, document: element.ownerDocument, size: bounds(element), dispose: null };
    let stopDrag = () => {};
    let contextTimer = null, suppressContext = false;
    const down = (event) => {
      suppressContext = false;
      if (![0, 2].includes(event.button) || !event.target.closest?.(".window-header, [data-dmicher-window-drag]")
        || event.target.closest("button, a, input, select, textarea, .header-control")
        || element.dataset.dmicherDocked === "true") return;
      refresh();
      const settings = getSettings();
      if (!settings.screen && !settings.windows) return;
      const right = event.button === 2;
      const members = right ? cascade(id) : [record];
      if (right && (!settings.windows || settings.cascadeRightButton === false || members.length < 2)) return;
      // Foundry's header starts native dragging for either button. A handled cascade owns this drag.
      // Do not prevent the default context menu until the pointer has actually moved.
      if (right) event.stopPropagation();
      active?.stop();
      stopDrag();
      const document = element.ownerDocument, view = document.defaultView;
      if (members.some((member) => member.element.ownerDocument !== document)) return;
      const starts = members.map((member) => ({ member, ...bounds(member.element) }));
      const start = bounds(element);
      const startX = event.clientX, startY = event.clientY, pointerId = event.pointerId;
      let latest = null, frame = null, moved = false, targetId = null;
      const update = () => {
        frame = null;
        if (!latest || !element.isConnected || element.ownerDocument !== document) return;
        const dx = latest.clientX - startX, dy = latest.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < 3) return;
        if (!moved) { moved = true; if (!right) unlink(id); }
        if (right) {
          if (getSettings().cascadeRightButton === false || !getSettings().windows) { stopDrag(); return; }
          suppressContext = true;
          // Native Foundry bounds each window separately; bound the group once to preserve its shape.
          const minX = Math.min(...starts.map((member) => member.left)), maxX = Math.max(...starts.map((member) => member.left + member.width));
          const minY = Math.min(...starts.map((member) => member.top)), maxY = Math.max(...starts.map((member) => member.top + member.height));
          const shiftX = Math.max(-minX, Math.min(dx, view.innerWidth - maxX));
          const shiftY = Math.max(-minY, Math.min(dy, view.innerHeight - maxY));
          for (const member of starts) member.member.application.setPosition({ left: member.left + shiftX, top: member.top + shiftY });
          return;
        }
        const raw = { left: start.left + dx, top: start.top + dy, width: start.width, height: start.height };
        const neighbors = [...records.values()].filter((other) => other !== record && other.element.ownerDocument === document
          && other.element.isConnected && other.element.dataset.dmicherDocked !== "true")
          .map((other) => ({ id: other.id, ...bounds(other.element) })).filter((other) => other.width > 0 && other.height > 0);
        const snapped = resolveWindowSnap(raw, { width: view.innerWidth, height: view.innerHeight }, neighbors, getSettings());
        targetId = snapped.targetId; application.setPosition(snapped.position);
      };
      const move = (next) => {
        if (next.pointerId !== pointerId) return;
        latest = next;
        if (right && Math.hypot(next.clientX - startX, next.clientY - startY) >= 3) {
          suppressContext = true; next.preventDefault(); next.stopPropagation();
        }
        if (frame === null) frame = view.requestAnimationFrame(update);
      };
      const up = (next) => {
        if (next.pointerId !== pointerId) return;
        if (frame !== null) view.cancelAnimationFrame(frame);
        frame = null;
        if (latest && next.type === "pointerup") { latest = next; update(); }
        if (moved && !right && targetId && next.type === "pointerup") connect(id, targetId);
        stopDrag();
      };
      stopDrag = () => {
        if (frame !== null) view.cancelAnimationFrame(frame);
        frame = null;
        latest = null;
        document.removeEventListener("pointermove", move, true);
        document.removeEventListener("pointerup", up, true);
        document.removeEventListener("pointercancel", up, true);
        view.removeEventListener("blur", stopDrag);
        if (active?.record === record) active = null;
        if (suppressContext) { if (contextTimer !== null) view.clearTimeout(contextTimer); contextTimer = view.setTimeout(() => { suppressContext = false; contextTimer = null; }, 500); }
        stopDrag = () => {};
      };
      active = { record, right, members, stop: () => stopDrag() };
      document.addEventListener("pointermove", move, true);
      document.addEventListener("pointerup", up, true);
      document.addEventListener("pointercancel", up, true);
      view.addEventListener("blur", stopDrag);
    };
    const contextMenu = (event) => { if (suppressContext) { event.preventDefault(); event.stopPropagation(); suppressContext = false; } };
    element.addEventListener("pointerdown", down, true);
    element.addEventListener("contextmenu", contextMenu, true);
    const view = element.ownerDocument.defaultView;
    const observer = view.MutationObserver ? new view.MutationObserver(refresh) : null;
    observer?.observe(element, { attributes: true, attributeFilter: ["style", "class", "data-dmicher-docked"] });
    const resize = view.ResizeObserver ? new view.ResizeObserver(refresh) : null; resize?.observe(element);
    record.dispose = () => {
      if (active?.members.includes(record)) active.stop(); stopDrag();
      observer?.disconnect(); resize?.disconnect(); unlink(id);
      if (contextTimer !== null) view.clearTimeout(contextTimer);
      element.removeEventListener("pointerdown", down, true); element.removeEventListener("contextmenu", contextMenu, true);
      records.delete(application); byId.delete(id);
    };
    records.set(application, record); byId.set(id, record);
  }
  return Object.freeze({
    bind, refresh,
    getLayout() {
      refresh();
      return Object.freeze({
        windows: Object.freeze([...records.values()].filter((record) => record.element.isConnected && record.element.dataset.dmicherDocked !== "true")
          .map((record) => Object.freeze({ id: record.id, ...bounds(record.element) }))),
        links: Object.freeze([...links].flatMap(([id, neighbors]) => [...neighbors].filter((other) => id < other)
          .map((other) => Object.freeze({ from: id, to: other }))))
      });
    },
    install(bus = globalThis.Hooks) {
      if (hooks.length || !bus?.on) return;
      for (const name of ["renderApplication", "renderApplicationV2"]) hooks.push([bus, name, bus.on(name, bind)]);
      for (const name of ["closeApplication", "closeApplicationV2"]) {
        hooks.push([bus, name, bus.on(name, (application) => records.get(application)?.dispose())]);
      }
      for (const application of globalThis.foundry?.applications?.instances?.values?.() ?? []) bind(application);
    },
    dispose() {
      for (const [bus, name, id] of hooks.splice(0)) bus.off(name, id);
      for (const record of [...records.values()]) record.dispose();
    }
  });
}
