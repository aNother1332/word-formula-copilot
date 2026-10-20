// Narrow, request/response bridge to the Windows COM host. Browser previews and
// the legacy Office.js host do not receive native access.
const pending = new Map();
let sequence = 0;
export const nativeHost = {
  get available() { return window.__FORMULA_NATIVE__ === true && !!window.chrome?.webview; },
  request(method, content = '') {
    if (!this.available) return Promise.reject(new Error('原生 Word 宿主不可用'));
    return new Promise((resolve, reject) => {
      const id = String(++sequence);
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Word 操作超时，请关闭文档中的对话框后重试'));
      }, 30000);
      pending.set(id, { resolve, reject, timeout });
      window.chrome.webview.postMessage({ id, method, content });
    });
  },
};

if (nativeHost.available) {
  window.chrome.webview.addEventListener('message', ({ data }) => {
    const entry = pending.get(data?.id);
    if (!entry) return;
    pending.delete(data.id);
    clearTimeout(entry.timeout);
    if (data.error) entry.reject(new Error(data.error));
    else entry.resolve(data.result);
  });
}
