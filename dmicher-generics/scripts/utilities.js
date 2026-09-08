export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

/** Client-local ordering only; this is not a socket authority or transaction. */
export function createSerialTaskQueue() {
  let tail = Promise.resolve();
  return (task) => {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
}
