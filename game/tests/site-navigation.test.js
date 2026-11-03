const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

test('page transitions coalesce navigation, reject stale readiness and recover from slow loads', () => {
  const dom = new JSDOM('<iframe id="site-content" name="rium-site-content"></iframe>', {
    url: 'https://rium.test/site-shell.html?view=https%3A%2F%2Frium.test%2Findex.html', runScripts: 'outside-only',
  });
  const w = dom.window;
  const timers = new Map();
  let serial = 0;
  w.matchMedia = () => ({ matches: false });
  w.setTimeout = (fn, delay) => { timers.set(++serial, { fn, delay }); return serial; };
  w.clearTimeout = id => timers.delete(id);
  const tick = delay => {
    for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); }
  };
  try {
    w.eval(fs.readFileSync(path.resolve(__dirname, '../../js/site-navigation.js'), 'utf8'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    const frame = w.document.querySelector('iframe');
    const send = (type, url) => w.dispatchEvent(new w.MessageEvent('message', {
      source: frame.contentWindow, data: { type, url },
    }));
    tick(0);
    send('rium-view-ready', 'https://rium.test/index.html'); tick(360);
    assert.equal(frame.hasAttribute('aria-busy'), false);
    const historyLength = w.history.length;
    send('rium-navigate', 'https://rium.test/projects.html');
    send('rium-navigate', 'https://rium.test/materials.html');
    assert.equal(frame.src, 'https://rium.test/index.html');
    assert.equal([...timers.values()].filter(t => t.delay === 140).length, 1);
    tick(140);
    assert.equal(frame.src, 'https://rium.test/materials.html');
    assert.equal(w.history.length, historyLength + 1);
    send('rium-view-ready', 'https://rium.test/projects.html');
    assert.equal(frame.classList.contains('is-leaving'), true);
    send('rium-view-ready', 'https://rium.test/materials.html');
    assert.equal(frame.classList.contains('is-leaving'), false);
    assert.equal(frame.classList.contains('is-entering'), true);
    tick(360);
    assert.equal(frame.classList.length, 0);
    send('rium-navigate', 'https://rium.test/guestbook.html'); tick(140); tick(8000);
    assert.equal(frame.classList.contains('is-loading'), false);
    assert.equal(frame.hasAttribute('aria-busy'), false);
    send('rium-navigate', 'https://other.test/projects.html');
    assert.equal(frame.src, 'https://rium.test/guestbook.html');
  } finally { dom.window.close(); }
});
