import { getRenderedElement } from "./windows.js";

export const SNAP_DISTANCE = 12;
const overlap = (a, b, c, d, gap) => a <= d + gap && b >= c - gap;
const closest = (values, value, distance) => values
  .filter((candidate) => Math.abs(candidate.value - value) <= distance)
  .sort((a, b) => Math.abs(a.value - value) - Math.abs(b.value - value))[0];

/** Coordinates always come from the original pointer delta, never the last snap. */
export function snapWindowPosition(rect, viewport, neighbors = [], settings = {}) {
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
  if (!x && !y) return { left, top };
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
  return horizontal ? { left: x.value, top: alignment?.value ?? top }
    : { left: alignment?.value ?? left, top: y.value };
}

/** Native Foundry owns dragging; this adds a position adjustment after its move. */
export function createWindowSnapController({ getSettings }) {
  const records = new Map();
  const hooks = [];
  function bind(application, html) {
    const element = getRenderedElement(application) ?? getRenderedElement(html);
    if (!element?.classList?.contains("dmicher-window") || typeof application?.setPosition !== "function") return;
    if (records.get(application)?.element === element) return;
    records.get(application)?.dispose();
    let stopDrag = () => {};
    const down = (event) => {
      if (event.button !== 0 || !event.target.closest?.(".window-header, [data-dmicher-window-drag]")
        || event.target.closest("button, a, input, select, textarea, .header-control")
        || element.dataset.dmicherDocked === "true") return;
      const settings = getSettings();
      if (!settings.screen && !settings.windows) return;
      stopDrag();
      const document = element.ownerDocument, view = document.defaultView;
      const start = element.getBoundingClientRect();
      const startX = event.clientX, startY = event.clientY, pointerId = event.pointerId;
      let latest = null, frame = null;
      const update = () => {
        frame = null;
        if (!latest || !element.isConnected || element.ownerDocument !== document) return;
        const dx = latest.clientX - startX, dy = latest.clientY - startY;
        const raw = { left: start.left + dx, top: start.top + dy, width: start.width, height: start.height };
        const neighbors = Array.from(document.querySelectorAll(".dmicher-window"))
          .filter((other) => other !== element && other.isConnected && other.dataset.dmicherDocked !== "true")
          .map((other) => other.getBoundingClientRect()).filter((other) => other.width > 0 && other.height > 0);
        const snapped = snapWindowPosition(raw, { width: view.innerWidth, height: view.innerHeight }, neighbors, getSettings());
        application.setPosition(snapped);
      };
      const move = (next) => {
        if (next.pointerId !== pointerId) return;
        latest = next;
        if (frame === null) frame = view.requestAnimationFrame(update);
      };
      const up = (next) => {
        if (next.pointerId !== pointerId) return;
        if (frame !== null) view.cancelAnimationFrame(frame);
        frame = null;
        if (latest && next.type === "pointerup") { latest = next; update(); }
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
        stopDrag = () => {};
      };
      document.addEventListener("pointermove", move, true);
      document.addEventListener("pointerup", up, true);
      document.addEventListener("pointercancel", up, true);
      view.addEventListener("blur", stopDrag);
    };
    element.addEventListener("pointerdown", down);
    const dispose = () => { stopDrag(); element.removeEventListener("pointerdown", down); records.delete(application); };
    records.set(application, { element, dispose });
  }
  return Object.freeze({
    bind,
    install(bus = globalThis.Hooks) {
      if (hooks.length || !bus?.on) return;
      for (const name of ["renderApplication", "renderApplicationV2"]) hooks.push([bus, name, bus.on(name, bind)]);
      for (const name of ["closeApplication", "closeApplicationV2"]) {
        hooks.push([bus, name, bus.on(name, (application) => records.get(application)?.dispose())]);
      }
    },
    dispose() {
      for (const [bus, name, id] of hooks.splice(0)) bus.off(name, id);
      for (const record of [...records.values()]) record.dispose();
    }
  });
}
