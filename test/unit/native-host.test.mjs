import test from 'node:test';
import assert from 'node:assert/strict';

test('native bridge pairs responses by id and propagates Word errors', async () => {
  let listener;
  const sent = [];
  globalThis.window = {
    __FORMULA_NATIVE__: true,
    chrome: { webview: {
      addEventListener(name, handler) { assert.equal(name, 'message'); listener = handler; },
      postMessage(message) { sent.push(message); },
    } },
  };
  try {
    const { nativeHost } = await import('../../src/native-host.js');
    const first = nativeHost.request('ping');
    const second = nativeHost.request('insertOoxml', '<xml/>');
    assert.notEqual(sent[0].id, sent[1].id);
    listener({ data: { id: sent[1].id, error: 'Document is protected' } });
    listener({ data: { id: sent[0].id, result: 'ready' } });
    listener({ data: { id: 'unknown', result: 'ignored' } });
    await assert.rejects(second, /Document is protected/);
    assert.equal(await first, 'ready');
    window.__FORMULA_NATIVE__ = false;
    assert.equal(nativeHost.available, false);
    await assert.rejects(nativeHost.request('ping'), /原生 Word 宿主不可用/);
  } finally {
    delete globalThis.window;
  }
});
