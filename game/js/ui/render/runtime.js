/* Stable image DOM and a shared presentation frame scheduler. */
(function (global) {
  const root = global.FurryGame || (global.FurryGame = {});
  const pending = new Map();
  let nextId = 0, frameId = 0;

  function frame(fn) {
    const id = ++nextId;
    pending.set(id, fn);
    if (!frameId) frameId = global.requestAnimationFrame(flush);
    return id;
  }

  function flush(now) {
    frameId = 0;
    // Callbacks queued during playback belong to the next browser frame.
    for (const [id, fn] of [...pending]) {
      if (!pending.delete(id)) continue;
      try { fn(now); } catch (error) { console.error('[RenderFrames]', error); }
    }
  }

  function cancelFrame(id) {
    pending.delete(id);
    if (!pending.size && frameId) {
      global.cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }

  const transient = ['icon-appear', 'buff-trigger-flash', 'acc-trigger-flash'];
  const key = node => node.nodeType === 1 && (
    node.id || node.getAttribute('data-buff-key') || node.getAttribute('data-render-key') ||
    node.getAttribute('data-acc-name') || node.getAttribute('data-item-index')
  );

  function attributes(node, next) {
    for (const attr of [...node.attributes]) {
      if (next.hasAttribute(attr.name)) continue;
      if (attr.name === 'class') {
        const kept = transient.filter(name => node.classList.contains(name)).join(' ');
        if (kept) node.setAttribute('class', kept);
        else node.removeAttribute('class');
      } else node.removeAttribute(attr.name);
    }
    for (const attr of [...next.attributes]) {
      let value = attr.value;
      if (attr.name === 'class') {
        const names = value.split(/\s+/).filter(name => name && !transient.includes(name));
        transient.forEach(name => { if (node.classList.contains(name)) names.push(name); });
        value = names.join(' ');
      }
      // Setting src, even unnecessarily, can restart an image's decode/presentation.
      if (node.getAttribute(attr.name) !== value) node.setAttribute(attr.name, value);
    }
  }

  function arm(node) {
    if (node.nodeType !== 1) return;
    if (node.classList.contains('icon-appear')) {
      node.addEventListener('animationend', event => {
        if (event.target === node) node.classList.remove('icon-appear');
      });
    }
    [...node.children].forEach(arm);
  }

  function retire(node) {
    const animated = node.nodeType === 1 &&
      node.matches('.buff-icon-wrap, .adv-combat-item-slot.filled, .adv-combat-acc-slot:not(.empty)');
    if (!animated) { node.remove(); return; }
    if (node._renderRetirement) return;
    const parent = node.parentElement;
    if (!parent) return;
    const style = node.getAttribute('style');
    const box = node.getBoundingClientRect(), parentBox = parent.getBoundingClientRect();
    const left = box.left - parentBox.left + parent.scrollLeft - parent.clientLeft;
    const top = box.top - parentBox.top + parent.scrollTop - parent.clientTop;
    if (!parent.style.position) parent.style.position = 'relative';
    Object.assign(node.style, {
      position: 'absolute', left: left + 'px', top: top + 'px',
      width: box.width + 'px', height: box.height + 'px',
      boxSizing: 'border-box', pointerEvents: 'none'
    });
    node.classList.add('icon-disappear');
    node._renderRetirement = {
      style,
      timer: global.setTimeout(() => { node._renderRetirement = null; node.remove(); }, 160)
    };
  }

  function revive(node) {
    if (!node._renderRetirement) return;
    global.clearTimeout(node._renderRetirement.timer);
    const style = node._renderRetirement.style;
    if (style == null) node.removeAttribute('style');
    else node.setAttribute('style', style);
    node.classList.remove('icon-disappear');
    node._renderRetirement = null;
  }

  function children(parent, nextParent) {
    const old = [...parent.childNodes], keyed = new Map(), unkeyed = new Map();
    for (const node of old) {
      const id = key(node);
      if (id) keyed.set(id, node);
      else {
        const type = node.nodeType + ':' + node.nodeName;
        if (!unkeyed.has(type)) unkeyed.set(type, { nodes: [], index: 0 });
        unkeyed.get(type).nodes.push(node);
      }
    }
    const used = new Set();
    let cursor = parent.firstChild;
    for (const next of [...nextParent.childNodes]) {
      const id = key(next), pool = unkeyed.get(next.nodeType + ':' + next.nodeName);
      let node = id ? keyed.get(id) : pool && pool.nodes[pool.index++];
      if (node && (node.nodeType !== next.nodeType || node.nodeName !== next.nodeName)) node = null;
      if (!node) { node = next.cloneNode(true); arm(node); }
      else {
        revive(node);
        if (node.nodeType === 1) { attributes(node, next); children(node, next); }
        else if (node.nodeValue !== next.nodeValue) node.nodeValue = next.nodeValue;
      }
      used.add(node);
      if (node !== cursor) parent.insertBefore(node, cursor);
      cursor = node.nextSibling;
    }
    old.forEach(node => { if (!used.has(node)) retire(node); });
  }

  function patchMarkup(host, html) {
    if (host._renderMarkup === html) return false;
    const template = global.document.createElement('template');
    template.innerHTML = html;
    children(host, template.content);
    host._renderMarkup = html;
    return true;
  }

  function preserveImages(host, next) {
    const images = new Map();
    host.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (!images.has(src)) images.set(src, { nodes: [], index: 0 });
      images.get(src).nodes.push(img);
    });
    next.querySelectorAll('img').forEach(img => {
      const pool = images.get(img.getAttribute('src'));
      if (!pool || pool.index >= pool.nodes.length) return;
      const kept = pool.nodes[pool.index++];
      attributes(kept, img);
      img.replaceWith(kept);
    });
  }

  function replacePreservingImages(host, html) {
    const template = global.document.createElement('template');
    template.innerHTML = html;
    preserveImages(host, template.content);
    host.replaceChildren(template.content);
  }

  root.RenderFrames = Object.freeze({ frame, cancel: cancelFrame });
  root.RenderDOM = Object.freeze({ patchMarkup, preserveImages, replacePreservingImages });
})(window);
