/* Canonical combat status metadata.
 *
 * This file is metadata only. StatusService is the single mutation boundary;
 * consumers read ids/properties/icons from this registry and never maintain a
 * second cleanse list in UI or mode-specific code.
 */
(function (global) {
  const root = global.FurryGame || (global.FurryGame = {});
  const definitions = [
    { id: 'burn',        property: 'burn',        label: '灼烧', icon: 'buff_icons/burn.webp',         polarity: 'debuff', stack: true,  max: 5, cleanse: 'decrement', trigger: 'turnEnd' },
    { id: 'bleed',       property: 'bleed',       label: '流血', icon: 'buff_icons/bleed.webp',        polarity: 'debuff', stack: true,  max: 3, cleanse: 'decrement', trigger: 'turnEnd' },
    { id: 'poison',      property: 'poison',      label: '中毒', icon: 'buff_icons/poison.webp',       polarity: 'debuff', stack: true,  max: 3, cleanse: 'decrement', trigger: 'turnEnd' },
    { id: 'freeze',      property: 'frozen',      label: '冷冻', icon: 'buff_icons/freeze.webp',       polarity: 'debuff', stack: false, max: 1, cleanse: 'reset',     trigger: 'turnEnd' },
    { id: 'blind',       property: 'blind',       label: '致盲', icon: 'buff_icons/blind.webp',        polarity: 'debuff', stack: false, max: 1, cleanse: 'reset',     trigger: 'persistent' },
    { id: 'bomb',        property: 'bomb',        label: '定时炸弹', icon: 'buff_icons/time_bomb.webp', polarity: 'debuff', stack: true, max: 5, cleanse: 'reset', trigger: 'onPlay' },
    { id: 'iceSeal',     property: 'iceSeal',     label: '冰封', icon: 'buff_icons/ice_seal.webp',    polarity: 'debuff', stack: false, max: 1, cleanse: 'reset',     trigger: 'onDraw' },
    { id: 'hypothermia', property: 'hypothermia', label: '失温', icon: 'buff_icons/hypothermia.webp', polarity: 'debuff', stack: true, max: 2, cleanse: 'reset', trigger: 'onThreshold' },
    { id: 'bind',        property: 'bindMark',   label: '捆缚', icon: 'items_icons/binding.webp',     polarity: 'debuff', mark: true, stack: false, max: 1, cleanse: 'never', trigger: 'turnStart' },
    { id: 'hypnosis',    property: 'hypnosis',    label: '催眠', icon: 'buff_icons/sleepy_1.webp',   polarity: 'debuff', stack: false, max: 1, cleanse: 'reset', trigger: 'persistent' },
    { id: 'sleep',       property: 'sleep',       label: '沉睡', icon: 'buff_icons/sleepy_2.webp',   polarity: 'debuff', stack: false, max: 1, cleanse: 'reset', trigger: 'turnStart' },

    { id: 'guard',       property: 'guard',       label: '守护', icon: 'buff_icons/guard.webp',        polarity: 'buff',   stack: true, max: 5, cleanse: 'decrement', trigger: 'onDamage', transferable: true },
    { id: 'fly',         property: 'fly',         label: '飞翔', icon: 'buff_icons/fly.webp',          polarity: 'buff',   stack: true, max: 2, cleanse: 'decrement', trigger: 'onDamage', transferable: true },
    { id: 'crit',        property: 'crit',        label: '暴击', icon: 'buff_icons/crit.webp',         polarity: 'buff',   stack: true, max: 3, cleanse: 'decrement', trigger: 'onAttack', transferable: true },
    { id: 'lush',        property: 'lush',        label: '茂盛', icon: 'buff_icons/lush.webp',         polarity: 'buff',   stack: true, max: 2, cleanse: 'decrement', trigger: 'attackStart', transferable: true },
    { id: 'parasite',    property: 'parasite',    label: '寄生', icon: 'buff_icons/parasite.webp',     polarity: 'buff',   stack: true, max: 1, cleanse: 'decrement', trigger: 'attackStart', transferable: true },
    { id: 'diving',      property: 'diving',      label: '潜水', icon: 'buff_icons/diving.webp',       polarity: 'buff',   stack: false, max: 1, cleanse: 'reset', trigger: 'onBlueAttack' },
    { id: 'bloodthirst', property: 'bloodthirst', label: '嗜血', icon: 'ui_icons/blood_thirsty.webp',   polarity: 'buff', mark: true, stack: false, max: 1, cleanse: 'never', trigger: 'hpThreshold' },
    { id: 'chaos_red',   property: 'chaos_red',   label: '混沌·红', icon: 'buff_icons/chaos_red.webp',    polarity: 'buff', stack: false, max: 1, cleanse: 'reset', trigger: 'onColorPlay' },
    { id: 'chaos_yellow',property: 'chaos_yellow',label: '混沌·黄', icon: 'buff_icons/chaos_yellow.webp', polarity: 'buff', stack: false, max: 1, cleanse: 'reset', trigger: 'onColorPlay' },
    { id: 'chaos_blue',  property: 'chaos_blue',  label: '混沌·蓝', icon: 'buff_icons/chaos_blue.webp',   polarity: 'buff', stack: false, max: 1, cleanse: 'reset', trigger: 'onColorPlay' },
    { id: 'chaos_green', property: 'chaos_green', label: '混沌·绿', icon: 'buff_icons/chaos_green.webp',  polarity: 'buff', stack: false, max: 1, cleanse: 'reset', trigger: 'onColorPlay' }
  ];

  const byId = Object.create(null);
  definitions.forEach(def => { byId[def.id] = Object.freeze(Object.assign({}, def)); });
  const all = Object.freeze(definitions.map(def => byId[def.id]));

  const get = id => byId[id] || null;
  const value = (entity, id) => {
    const def = get(id);
    return def && entity ? entity[def.property] : undefined;
  };
  const amount = (entity, id) => {
    const raw = value(entity, id);
    return typeof raw === 'boolean' ? (raw ? 1 : 0) : Math.max(0, Number(raw) || 0);
  };
  const has = (entity, id) => amount(entity, id) > 0;
  const list = (entity, filter) => all.filter(def => has(entity, def.id) && (!filter || filter(def)));
  const ids = (filter) => all.filter(filter || (() => true)).map(def => def.id);

  function clear(entity, id, mode) {
    const def = get(id);
    if (!def || !entity || !has(entity, id)) return false;
    // Marks are permanent until their own gameplay rule expires; purification
    // and group cleanses must never remove them.
    if (def.cleanse === 'never') return false;
    const reset = mode === 'all' || mode === 'reset' || def.cleanse === 'reset';
    if (reset || !def.stack) entity[def.property] = def.stack ? 0 : false;
    else entity[def.property] = Math.max(0, amount(entity, id) - 1);
    return true;
  }

  function clearGroup(entity, polarity, mode = 'all') {
    if (!entity) return [];
    const removed = [];
    all.forEach(def => {
      if (def.polarity !== polarity) return;
      if (clear(entity, def.id, mode)) removed.push(def.id);
    });
    return removed;
  }

  const api = {
    all,
    get,
    ids,
    value,
    amount,
    has,
    list,
    clear,
    clearGroup,
    buffs: Object.freeze(all.filter(def => def.polarity === 'buff')),
    debuffs: Object.freeze(all.filter(def => def.polarity === 'debuff'))
  };

  root.StatusRegistry = Object.freeze(api);
  global.StatusRegistry = root.StatusRegistry;
})(window);
