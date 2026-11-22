'use strict';
// 离线加载实际 HTML 的脚本顺序，发现单测桩未覆盖的入口与界面依赖断裂。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const gameRoot = path.resolve(__dirname, '..');

async function boot(t, entry) {
  const file = path.join(gameRoot, entry.split('?')[0]);
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
    runScripts: 'outside-only', url: 'http://localhost/game/' + entry,
    pretendToBeVisual: true
  });
  t.after(() => dom.window.close());
  const w = dom.window, errors = [];
  w.addEventListener('error', event => errors.push(event.error || event.message));
  w.setTimeout = w.setInterval = w.requestAnimationFrame = () => 1;
  w.clearTimeout = w.clearInterval = w.cancelAnimationFrame = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({
    measureText: text => ({ width: String(text).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} })
  }, { get: (target, key) => target[key] || (() => {}) });
  w.Image = class {
    constructor() { this.complete = true; this.naturalWidth = 64; this.naturalHeight = 64; }
    set src(value) { this._src = value; Promise.resolve().then(() => this.onload && this.onload()); }
    get src() { return this._src; }
  };
  // 不请求网络；页面启动必须能使用内嵌配置与地图。
  w.fetch = () => { throw new Error('Unexpected network request during local startup'); };
  const context = dom.getInternalVMContext();
  for (const script of w.document.querySelectorAll('script')) {
    Object.defineProperty(w.document, 'currentScript', { configurable: true, value: script });
    const source = script.getAttribute('src');
    if (source) {
      assert.ok(!/^https?:/.test(source), 'startup scripts are local');
      const scriptFile = path.resolve(path.dirname(file), source.split('?')[0]);
      vm.runInContext(fs.readFileSync(scriptFile, 'utf8'), context, { filename: scriptFile });
    } else if (script.textContent.trim()) {
      vm.runInContext(script.textContent, context, { filename: file + ':inline' });
    }
  }
  delete w.document.currentScript;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, []);
  return { w, context };
}

test('classic entry boots and renders the restored combat controls', async t => {
  const { w, context } = await boot(t, 'index.html');
  assert.ok(w.document.querySelector('#select-screen button'));
  const ui = vm.runInContext('ui', context);
  w.document.querySelector('#mode-1v1').click();
  assert.match(w.document.querySelector('[data-name="RedFlag"] img').getAttribute('src'), /avatars\/RedFlag\.webp$/);
  ui._buildGameScreen();
  assert.ok(w.document.querySelector('#player-reserve'));
  assert.ok(w.document.querySelector('#skill-book-btn'));
  assert.equal(typeof ui._renderDiceControl, 'function');
  assert.equal(typeof w.appendParsedSegments, 'function');
  assert.equal(w.CharacterRegistry.get('Moze').hp, 80);
  assert.equal(w.CharacterRegistry.get('Vixraps').hp, 65);
  assert.equal(w.CharacterRegistry.get('RedFlag').hp, 60);
  ui._updateAvatar('player', 'RedFlag');
  assert.match(w.document.querySelector('#player-avatar').getAttribute('src'), /avatars\/RedFlag\.webp$/);
});

test('adventure entry boots, starts an embedded map and renders the new sacrifice room', async t => {
  const { w } = await boot(t, 'adventure/adventure.html');
  const picks = w.document.querySelectorAll('.adv-char-pick');
  assert.equal(picks.length, w.CharacterRegistry.all().filter(character => !character.adventureNpc).length);
  assert.equal(w.document.querySelector('.adv-char-pick img[alt="RedFlag"]').getAttribute('src'), '../avatars/RedFlag.webp');
  picks[0].click();
  w.document.querySelector('#adv-start').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(w.document.querySelector('.adventure-wrap'));
  assert.ok(w.document.querySelector('.adv-cell.room-sacrifice'));
  const ui = new w.AdventureUI(w.document.getElementById('adventure-container'));
  ui.eng.start(new w.AdventureMap([[0, 10, 1]]), 'Ryan', { trophyWhiteCards: ['BurnTrophy'] });
  ui.eng.move(0, 1); ui.eng.enterCurrent(); ui.bindActions(); ui.render();
  assert.ok(ui.container.querySelector('#adv-sacrifice-upgrade'));
  assert.match(ui.container.textContent, /本层剩余 3 \/ 3 次升级/);
});

test('adventure map skill book uses the current player numbers and defense slots', async t => {
  const { w } = await boot(t, 'adventure/adventure.html?char=Ryan');
  w.document.querySelector('#adv-skill-book').click();
  const grid = w.document.querySelector('.game-menu-box-book .skill-grid');
  assert.ok(grid);
  const rows = [...grid.querySelectorAll('.skill-row')];
  const number = row => row.querySelector('.skill-num').textContent;
  assert.deepEqual(rows.map(number), ['0', '1', '2', '3', '4', '5']);
  assert.deepEqual(rows.filter(row => !row.querySelector('.skill-no-def')).map(number), ['0', '1', '2']);
});

test('online entry boots and keeps the shared combat UI available', async t => {
  const { w } = await boot(t, 'online_game/index.html');
  assert.equal(typeof w.GameUI.prototype._buildGameScreen, 'function');
  assert.equal(typeof w.GameUI.prototype._renderDiceControl, 'function');
  assert.equal(typeof w.appendParsedSegments, 'function');
});

test('spectator sees both real hands below the battlefield without action controls', async t => {
  const { w } = await boot(t, 'online_game/index.html');
  const match = new w.OnlineMatchHost('Ryan', 'Chan', 'host', 4, {hostNickname:'甲', guestNickname:'乙'});
  const ui = w.onlineUI;
  ui.role = 'spectator';
  const state = match.projectSpectator();
  assert.ok(!('pendingDialog' in state) && !('chanFiveCards' in state));
  assert.equal(typeof state.deck, 'number');
  assert.equal(match.project('host').aiHand, null);
  assert.equal(match.project('guest').aiHand, null);
  state.atkCard = state.playerHand[0];
  ui.renderSpectator(state);
  const rows = [...w.document.querySelectorAll('.watch-screen .player-hand-zone')];
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.querySelector('.zone-title').textContent), ['房主手牌 · 甲', '客方手牌 · 乙']);
  assert.deepEqual(rows.map(row => row.querySelectorAll('canvas').length), [match.engine.h.player.length, match.engine.h.ai.length]);
  assert.ok(!w.document.querySelector('.watch-screen .ai-hands-stack, .watch-screen button'));
  ui.renderSpectator({...state, stateVersion: state.stateVersion + 1, aiHand: []});
  ui.renderSpectator(state);
  assert.equal(rows[1].querySelectorAll('canvas').length, 0);
});

test('spectator shows a settled defense in the defense zone before revealing the discard top', async t => {
  const { w } = await boot(t, 'online_game/index.html');
  const ui = w.onlineUI;
  ui.role = 'spectator';
  let finishDefense;
  const setTimeout = w.setTimeout;
  w.setTimeout = (fn, ms) => {
    if (ms === 850) finishDefense = fn;
    return setTimeout(fn, ms);
  };
  for (const [attacker, defender, eventType, owner] of [
    ['host', 'guest', 'aiDefend', 'ai'],
    ['guest', 'host', 'defend', 'player']
  ]) {
    ui.watchView = null;
    const match = new w.OnlineMatchHost('Ryan', 'Chan', attacker, 4);
    match.setStarted(true);
    const attack = w.FurryGame.Card.number('RED', 2);
    const defense = w.FurryGame.Card.number('RED', 1);
    match.engine.h.player = [attacker === 'host' ? attack : defense];
    match.engine.h.ai = [attacker === 'guest' ? attack : defense];
    match.engine.s.discardTop = w.FurryGame.Card.number('RED', 4);
    const command = (actor, method, card) => match.dispatch(actor, method, {
      cardId: w.cardMatchKey(card), index: 0
    });
    const attackResult = command(attacker, 'playCard', attack);
    assert.equal(attackResult.ok, true, attackResult.error);
    ui.renderSpectator(match.projectSpectator());
    const result = command(defender, 'defendCard', defense);
    assert.equal(result.ok, true, result.error);
    const events = match.eventsForViewer(result.events, 'host', defender);
    assert.ok(events.some(event => event.type === eventType));
    const snapshot = match.projectSpectator(events);
    assert.equal(snapshot.defCard, null);
    assert.equal(snapshot.defensePlay.owner, owner);
    ui.renderSpectator(snapshot);
    ui.renderSpectator(match.projectSpectator());
    assert.ok(w.document.querySelector('#def-cards canvas'));
    assert.equal(ui.watchView.state.discardTop.uid, attack.uid);
    finishDefense();
    assert.equal(w.document.querySelector('#def-cards canvas'), null);
    assert.equal(ui.watchView.state.discardTop.uid, defense.uid);
  }
});

test('three online pages share seats, start without spectator readiness and close together', async t => {
  const pages = await Promise.all(Array.from({length:3}, () => boot(t, 'online_game/index.html')));
  // Use the real room and browser adapters with asynchronous in-memory WebSockets.
  class Socket {
    constructor() { this.listeners = {}; this.readyState = 1; }
    accept() {}
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    emit(type, data) { for (const fn of this.listeners[type] || []) fn(data); }
    send(data) { queueMicrotask(() => this.other.emit('message', {data})); }
    close(code = 1000, reason = '') {
      if (this.readyState === 3) return;
      this.readyState = this.other.readyState = 3;
      queueMicrotask(() => { this.emit('close', {code, reason}); this.other.emit('close', {code, reason}); });
    }
  }
  let browser;
  const ctx = vm.createContext({ TextEncoder, crypto: require('node:crypto'), setTimeout, clearTimeout,
    Response: class {}, WebSocketPair: class {
      constructor() { this[0] = browser; this[1] = new Socket(); this[1].other = browser; browser.other = this[1]; }
    }
  });
  const source = fs.readFileSync(path.join(gameRoot, 'online_game/signaling/worker.js'), 'utf8');
  const room = vm.runInContext(source.replace('export default', 'const worker =').replace('export class Room', 'class Room') + '\nnew Room({})', ctx);
  for (const { w } of pages) {
    w.WebSocket = class extends Socket {
      static OPEN = 1;
      constructor() {
        super(); browser = this;
        room.fetch({headers:{get:() => 'websocket'}});
        queueMicrotask(() => this.emit('open', {}));
      }
    };
  }
  const [host, guest, viewer] = pages.map(p => p.w.onlineUI);
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const opts = {roomCode:'ABCD', nickname:'甲'};
  host.connect('host', opts);
  await tick();
  assert.equal(host.root.querySelector('[data-char="RedFlag"] img').getAttribute('src'), '../avatars/RedFlag.webp');
  const joinRoom = (ui, nickname) => {
    ui.root.querySelector('#online-room-code').value = opts.roomCode;
    ui.root.querySelector('#online-nickname').value = nickname;
    assert.equal(ui.root.querySelector('#online-watch'), null);
    const join = ui.root.querySelector('#online-join');
    assert.equal(join.textContent, '加入房间');
    join.disabled = false; // JSDOM provides no native peer connection.
    join.click();
  };
  joinRoom(guest, '乙');
  await tick();
  assert.equal(guest.role, 'guest');
  assert.equal(host.root.querySelector('button[data-seat]'), null, 'the host cannot leave the battle seat');
  guest.root.querySelector('button[data-seat="spectator"]').click();
  await tick();
  assert.equal(guest.role, 'spectator');
  const occupied = host.root.querySelector('[data-occupied-seat="spectator"]');
  assert.equal(occupied.querySelector('strong').textContent, '乙');
  assert.equal(occupied.querySelector('.online-player-avatar').textContent, guest.avatar);
  guest.root.querySelector('button[data-seat="guest"]').click();
  await tick();
  joinRoom(viewer, '丙');
  await tick();
  assert.equal(viewer.role, 'spectator');
  const viewedStatus = role => viewer.root.querySelector(`[data-occupied-seat="${role}"] .online-ready`).textContent;
  for (const ui of [host, guest]) {
    assert.equal(viewedStatus(ui.role), '未准备');
    ui.root.querySelector('[data-char]').click();
    ui.root.querySelector('#online-ready').click();
    await tick();
    assert.equal(viewedStatus(ui.role), '已准备');
  }
  guest.root.querySelector('#online-ready').click();
  await tick();
  assert.equal(viewedStatus('guest'), '未准备');
  guest.root.querySelector('#online-ready').click();
  viewer.root.querySelector('#online-leave').click();
  await tick();
  host.root.querySelector('#online-start-match').click();
  await tick();
  assert.ok(host.match && guest.match);
  guest.peer.sendControl('changeSeat', {role:'spectator'});
  await tick();
  assert.equal(room.seat('guest').meta.peerId, guest.peer.peerId);
  joinRoom(viewer, '丙');
  await tick();
  assert.equal(viewer.role, 'spectator');
  assert.ok(viewer.watchView);
  assert.equal(viewer.watchView.state.matchId, host.match.matchId);
  const savedViewer = viewer._readRoomSession();
  viewer.connect('spectator', { ...savedViewer, autoRestore: true });
  await tick();
  assert.ok(viewer.watchView);
  assert.equal(room.clients.size, 3);
  const actor = host.match.project('host').onlineActor === 'host' ? host : guest;
  const outcome = await actor.battleSession.dispatch('doEnterDiscard');
  assert.equal(outcome.ok, true, outcome.error);
  await tick();
  const version = host.match.stateVersion;
  assert.equal(viewer.watchView.state.stateVersion, version);
  assert.equal(viewer.watchView.state.phase, host.match.engine.s.phase);
  viewer.peer.sendRoom({__onlineTransport:1, data:{kind:'returnLobby'}});
  viewer.peer.sendControl('changeSeat', {role:'guest'});
  await tick();
  assert.equal(viewer.role, 'spectator');
  assert.equal(host.match.stateVersion, version);
  host.peer.close();
  await tick();
  assert.equal(viewer.role, 'spectator');
  guest.peer.close();
  await tick();
  assert.equal(room.clients.size, 0);
  assert.equal(viewer.role, null);
  assert.ok(viewer.root.querySelector('#online-connect-form'));
});
