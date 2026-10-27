/**
 * Hand-area discard picker (Vixraps-style): select from the live hand, confirm
 * in a bottom strip — no card-choice popup.
 */
(function (global) {
  function HandDiscardPicker(ui) {
    this.ui = ui;
    this._active = null;
    this._bar = null;
  }

  HandDiscardPicker.prototype.isActive = function () {
    return !!this._active;
  };

  HandDiscardPicker.prototype._handEl = function () {
    const sel = (this._active && this._active.handSelector) || '#player-hand';
    return typeof sel === 'string' ? document.querySelector(sel) : sel;
  };

  HandDiscardPicker.prototype._rerender = function () {
    const a = this._active;
    if (a && typeof a.rerender === 'function') {
      a.rerender();
      return;
    }
    const ui = this.ui;
    if (ui && typeof ui._renderPlayerHand === 'function') ui._renderPlayerHand();
    else if (ui && typeof ui.updateDisplay === 'function') ui.updateDisplay();
  };

  /**
   * @param {object} opts
   * @param {Array} opts.cards full hand snapshot
   * @param {number[]} [opts.allowedIndices] if set, only these hand indices
   * @param {number} [opts.max=1]
   * @param {string} [opts.title]
   * @param {function(number[]):void} opts.onConfirm indices into opts.cards / hand
   * @param {function():void} [opts.onCancel]
   * @param {boolean} [opts.allowCancel=false]
   * @param {string|Element} [opts.handSelector='#player-hand']
   * @param {function():void} [opts.rerender]
   */
  HandDiscardPicker.prototype.start = function (opts) {
    this.cancel(true);
    const cards = Array.isArray(opts.cards) ? opts.cards : [];
    const allowed = Array.isArray(opts.allowedIndices)
      ? opts.allowedIndices.slice()
      : cards.map((_, i) => i);
    this._active = {
      cards,
      allowed: new Set(allowed),
      max: Math.max(1, opts.max || 1),
      title: opts.title || '选择要弃掉的手牌',
      onConfirm: opts.onConfirm,
      onCancel: opts.onCancel,
      onToggle: opts.onToggle || null,
      allowCancel: !!opts.allowCancel,
      handSelector: opts.handSelector || '#player-hand',
      rerender: opts.rerender || null,
      selected: Array.isArray(opts.selected) ? opts.selected.slice() : []
    };
    if (this.ui) this.ui._handDiscardPicker = this;
    this._ensureBar();
    this._refreshBar();
    this._rerender();
    this.bindHand(this._handEl());
  };

  HandDiscardPicker.prototype.cancel = function (silent) {
    const active = this._active;
    this._active = null;
    if (this.ui && this.ui._handDiscardPicker === this) this.ui._handDiscardPicker = null;
    if (this._bar) { this._bar.remove(); this._bar = null; }
    if (active) {
      if (typeof active.rerender === 'function') active.rerender();
      else if (this.ui && typeof this.ui._renderPlayerHand === 'function') this.ui._renderPlayerHand();
    }
    if (!silent && active && active.onCancel) active.onCancel();
  };

  HandDiscardPicker.prototype._ensureBar = function () {
    if (this._bar && !this._bar.isConnected) this._bar = null;
    if (this._bar) return;
    const bar = document.createElement('div');
    bar.id = 'hand-discard-picker-bar';
    bar.className = 'hand-discard-picker-bar';
    const controls = document.getElementById('controls');
    if (controls && controls.parentNode) controls.parentNode.insertBefore(bar, controls.nextSibling);
    else {
      const adv = document.getElementById('adv-hand-zone');
      if (adv && adv.parentNode) adv.parentNode.insertBefore(bar, adv.nextSibling);
      else document.body.appendChild(bar);
    }
    this._bar = bar;
  };

  HandDiscardPicker.prototype._refreshBar = function () {
    if (!this._bar || !this._active) return;
    const a = this._active;
    const n = a.selected.length;
    this._bar.innerHTML =
      '<span class="hand-discard-picker-hint">' + a.title +
      (a.max > 1 ? '（' + n + '/' + a.max + '）' : '') + '</span>' +
      '<button type="button" class="ctrl-btn btn-discard" id="hand-discard-confirm"' +
      (n < 1 || n > a.max ? ' disabled' : '') + '>' + (a.title.indexOf('弹夹') >= 0 ? '确认储备' : '确认弃牌') +
      (n ? ' (' + n + ')' : '') + '</button>' +
      (a.allowCancel
        ? '<button type="button" class="ctrl-btn btn-skip" id="hand-discard-cancel">取消</button>'
        : '');
    const confirm = this._bar.querySelector('#hand-discard-confirm');
    if (confirm) confirm.onclick = () => this._confirm();
    const cancel = this._bar.querySelector('#hand-discard-cancel');
    if (cancel) cancel.onclick = () => this.cancel();
  };

  HandDiscardPicker.prototype._confirm = function () {
    const a = this._active;
    if (!a || !a.selected.length) return;
    const indices = a.selected.slice();
    const cb = a.onConfirm;
    this.cancel(true);
    if (cb) cb(indices);
  };

  HandDiscardPicker.prototype.toggle = function (index) {
    const a = this._active;
    if (!a || !a.allowed.has(index)) return;
    if (typeof a.onToggle === 'function') {
      a.onToggle(index);
      return;
    }
    const pos = a.selected.indexOf(index);
    if (pos >= 0) a.selected.splice(pos, 1);
    else {
      if (a.max === 1) a.selected = [index];
      else if (a.selected.length < a.max) a.selected.push(index);
      else return;
    }
    this._refreshBar();
    this._rerender();
    this.bindHand(this._handEl());
  };

  /** Sync selected indices from engine pending without restarting. */
  HandDiscardPicker.prototype.applySelected = function (selected) {
    if (!this._active) return;
    this._active.selected = Array.isArray(selected) ? selected.slice() : [];
    this._refreshBar();
    this.bindHand(this._handEl());
  };

  /** Call after hand DOM rebuild to wire clicks + selected class. */
  HandDiscardPicker.prototype.bindHand = function (container) {
    const a = this._active;
    if (!a) return;
    const el = container || this._handEl();
    if (!el) return;
    Array.from(el.children).forEach((node, i) => {
      let index = Number(node.dataset.index);
      if (!Number.isFinite(index)) {
        index = i;
        node.dataset.index = String(i);
      }
      const allowed = a.allowed.has(index);
      node.classList.toggle('hand-discard-allowed', allowed);
      node.classList.toggle('hand-discard-blocked', !allowed);
      node.classList.toggle('selected', a.selected.includes(index));
      node.classList.remove('disabled');
      node.style.pointerEvents = allowed ? '' : 'none';
      node.style.opacity = allowed ? '' : '0.45';
      node.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggle(index);
      };
    });
  };

  global.HandDiscardPicker = HandDiscardPicker;
})(typeof window !== 'undefined' ? window : globalThis);
