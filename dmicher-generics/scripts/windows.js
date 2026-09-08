const renderingApplications = new WeakSet();

export function getRenderedElement(html) {
  const isElement = (value) => Boolean(value) && (
    (typeof HTMLElement !== "undefined" && value instanceof HTMLElement)
    || (value.nodeType === 1 && typeof value.querySelector === "function")
  );
  if (isElement(html)) return html;
  if (isElement(html?.[0])) return html[0];
  if (isElement(html?.element)) return html.element;
  return null;
}

export function openSingletonApplication(application, createApplication, { moduleId = "dmicher-generics" } = {}) {
  if (application?.rendered || renderingApplications.has(application)) {
    if (application.rendered) application.bringToFront();
    return application;
  }
  const nextApplication = createApplication();
  renderingApplications.add(nextApplication);
  let renderResult;
  try {
    renderResult = nextApplication.render({ force: true });
  } catch (error) {
    renderingApplications.delete(nextApplication);
    throw error;
  }
  if (renderResult && typeof renderResult.then === "function") {
    void Promise.resolve(renderResult).then(
      () => renderingApplications.delete(nextApplication),
      (error) => {
        renderingApplications.delete(nextApplication);
        console.error(`${moduleId} | Unable to render application`, error);
      }
    );
  } else renderingApplications.delete(nextApplication);
  return nextApplication;
}

export function runAfterApplicationLifecycle(result, continuation) {
  if (result && typeof result.then === "function") return result.then(continuation);
  continuation();
  return result;
}

export function moveSettingFirst(application, html, { moduleId, settingKey }) {
  const root = getRenderedElement(html) ?? application?.element;
  if (!root?.querySelector) return;
  const settingId = `${moduleId}.${settingKey}`;
  const input = root.querySelector(`[name="${settingId}"]`);
  const row = root.querySelector(`[data-setting-id="${settingId}"]`) ?? input?.closest?.(".form-group");
  const category = row?.closest?.(`[data-category="${moduleId}"]`) ?? row?.parentElement;
  if (!category) return;
  const firstEntry = Array.from(category.children).find((child) => child.matches?.(".form-group"));
  if (firstEntry && firstEntry !== row) category.insertBefore(row, firstEntry);
}
