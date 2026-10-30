/**
 * 图鉴 —— 展示主角（玩家角色）/怪物（含首领）/道具/饰品/Buff图鉴。
 */
(function () {
  // 怪物/Boss NPC 牌堆：白1~3×4、白4~6×2、白7×2；Boss 另加白0。
  // atk/def 下标与 NPC_SKILL_VALUES 一一对应。
  const NPC_SKILL_VALUES = [1, 2, 3, 4, 5, 6, 7, 0];
  const NPC_SKILL_GRID = [
    { atkKey: 0, defKey: 0, label: '1' },
    { atkKey: 1, defKey: 1, label: '2' },
    { atkKey: 2, defKey: 2, label: '3' },
    { atkKey: 7, defKey: 7, label: '0' },
    { atkKey: 3, defKey: -1, label: '4' },
    { atkKey: 4, defKey: -1, label: '5' },
    { atkKey: 5, defKey: -1, label: '6' },
    { atkKey: 6, defKey: -1, label: '7' }
  ];

  // 所有会在战斗界面显示的状态集中维护，避免规则页和图鉴出现两套说明。
  // desc 三行：堆叠上限：n / 维持效果：衰减|持续|瞬爆 / 效果说明
  const BUFF_DATA = [
    { key: 'burn', name: '灼伤', type: '负面状态', icon: 'icons/buff_icons/burn.webp', desc: '堆叠上限：5\n维持效果：衰减\n拥有灼伤的角色在自己的进攻回合结束时受到等同于层数的伤害，随后减少1层。' },
    { key: 'bleed', name: '流血', type: '负面状态', icon: 'icons/buff_icons/bleed.webp', desc: '堆叠上限：3\n维持效果：衰减\n防御方用0~3点数字牌防御时，额外承受等同于[流血]层数的伤害，随后减少1层流血。' },
    { key: 'poison', name: '中毒', type: '负面状态', icon: 'icons/buff_icons/poison.webp', desc: '堆叠上限：2\n维持效果：持续\n拥有中毒的角色在自己的进攻回合开始前受到等同于层数的伤害；层数不会自然减少，可被净化。' },
    { key: 'freeze', name: '冷冻', type: '负面状态', icon: 'icons/buff_icons/freeze.webp', desc: '堆叠上限：1\n维持效果：持续\n无法防御蓝色攻击。受到蓝色攻击时只能跳过防御并承受全部伤害。' },
    { key: 'blind', name: '致盲', type: '负面状态', icon: 'icons/buff_icons/blind.webp', desc: '堆叠上限：1\n维持效果：持续\n持续期间不能在战斗中使用一次性道具，只能等待被净化。' },
    { key: 'iceSeal', name: '冰封', type: '负面状态', icon: 'icons/buff_icons/ice_seal.webp', desc: '堆叠上限：1\n维持效果：衰减\n有冰封的角色在下一次补牌时少补1张牌，随后移除1层冰封；可被净化。' },
    { key: 'bomb', name: '定时炸弹', type: '负面状态', icon: 'icons/buff_icons/time_bomb.webp', desc: '堆叠上限：1\n维持效果：瞬爆\n初始倒计时为5。被施加者每打出1张牌倒计时减少1，归零时爆炸并受到10点伤害；图标右上角数字为当前倒计时；可被净化。' },
    { key: 'guard', name: '守护', type: '正面状态', icon: 'icons/buff_icons/guard.webp', desc: '堆叠上限：5\n维持效果：持续\n受到攻击或反击伤害时可消耗守护层数等额减免；不能减免灼伤、流血、中毒、炸弹、荆棘、寄生等Buff伤害。' },
    { key: 'fly', name: '飞翔', type: '正面状态', icon: 'icons/buff_icons/fly.webp', desc: '堆叠上限：2\n维持效果：持续\n受到攻击或反击伤害时可消耗1层投掷12面骰，1~6成功躲避、7~12失败；失败后可继续尝试或使用守护。不能减免Buff伤害，也不能躲避攻击附带的状态。' },
    { key: 'harden', name: '硬化', type: '正面状态', icon: 'icons/buff_icons/harden.webp', desc: '堆叠上限：2\n维持效果：持续\n每层使真正标记为不可防御的攻击伤害减免1点，最多减至0；层数不消耗。该减免先于守护和飞翔结算，不减免灼伤、流血、中毒、炸弹等Buff独立伤害，可被净化。' },
    { key: 'lush', name: '茂盛', type: '正面状态', icon: 'icons/buff_icons/lush.webp', desc: '堆叠上限：2\n维持效果：持续\n每有1层，在自己进攻开始前恢复1点生命；可被净化移除。' },
    { key: 'parasite', name: '寄生', type: '正面状态', icon: 'icons/buff_icons/parasite.webp', desc: '堆叠上限：1\n维持效果：持续\n在自己进攻开始前，吸取对手1点生命（不可用守护/飞翔/道具减免）；可被净化移除。' },
    { key: 'crit', name: '暴击', type: '正面状态', icon: 'icons/buff_icons/crit.webp', desc: '堆叠上限：3\n维持效果：持续\n攻击修正类。进攻伤害>4（防御前）时可在攻击修正阶段消耗1层使本次攻击不可防御；与[熔脉]、攻击修正道具互斥不可叠用；本身不可防御的技能不能使用。可被净化。' },
    { key: 'magmaVein', name: '熔脉', type: '正面状态', icon: 'icons/buff_icons/magma_vein.webp', desc: '堆叠上限：2\n维持效果：持续至触发\n攻击修正类。在攻击修正阶段主动消耗1层，使本次进攻伤害×1.5（向上取整）；只放大技能伤害。与[暴击]、攻击修正道具互斥不可叠用；不作用于防御/反击。可被净化。' },
    { key: 'chaos_red', name: '混沌·红', type: '正面状态', icon: 'icons/buff_icons/chaos_red.webp', desc: '堆叠上限：1\n维持效果：衰减\nKnight专属状态。打出红色数字牌/指定为红的黑白牌，或指定为红的白色道具牌后获得，进攻回合开始前清除。' },
    { key: 'chaos_yellow', name: '混沌·黄', type: '正面状态', icon: 'icons/buff_icons/chaos_yellow.webp', desc: '堆叠上限：1\n维持效果：衰减\nKnight专属状态。打出黄色数字牌/指定为黄的黑白牌，或指定为黄的白色道具牌后获得，进攻回合开始前清除。' },
    { key: 'chaos_blue', name: '混沌·蓝', type: '正面状态', icon: 'icons/buff_icons/chaos_blue.webp', desc: '堆叠上限：1\n维持效果：衰减\nKnight专属状态。打出蓝色数字牌/指定为蓝的黑白牌，或指定为蓝的白色道具牌后获得，进攻回合开始前清除。' },
    { key: 'chaos_green', name: '混沌·绿', type: '正面状态', icon: 'icons/buff_icons/chaos_green.webp', desc: '堆叠上限：1\n维持效果：衰减\nKnight专属状态。打出绿色数字牌/指定为绿的黑白牌，或指定为绿的白色道具牌后获得，进攻回合开始前清除。' },
    { key: 'diving', name: '潜水', type: '正面状态', icon: 'icons/buff_icons/diving.webp', desc: '堆叠上限：1\n维持效果：持续\n拥有潜水的角色免疫蓝色攻击（含被指定为蓝色的白牌）造成的伤害和buff施加。对手依旧可以对自己施加正面增益。冰封、诅咒等仍能命中。' },
    { key: 'scorch', name: '炙热', type: '负面状态', icon: 'icons/buff_icons/scorch.webp', desc: '堆叠上限：1\n维持效果：持续\n持有期间触发灼伤结算时，仍造成灼伤伤害，但不消退灼伤层数；可被净化。' },
    { key: 'hypothermia', name: '失温', type: '负面状态', icon: 'icons/buff_icons/hypothermia.webp', desc: '堆叠上限：2\n维持效果：衰减\n当失温达到2层时，立即强制弃1张牌（玩家自选，NPC按最低优先级弃牌），随后失温削减1层。' },
    { key: 'bind', name: '捆缚', type: '印记', icon: 'icons/buff_icons/binding.webp', desc: '堆叠上限：1\n维持效果：规则结束\n捆缚印记不能被净化或超级净化清除；目标在本回合结束后跳过自己的进攻阶段，由当前回合角色再发动一次进攻，额外进攻完成后按规则移除。' },
    { key: 'hypnosis', name: '催眠', type: '负面状态', icon: 'icons/buff_icons/sleepy_1.webp', desc: '堆叠上限：1\n维持效果：持续\n拥有催眠的角色在自己的进攻阶段结束、切换到对手进攻阶段时立即转化为[沉睡]。已处于[沉睡]时免疫新的[催眠]。' },
    { key: 'sleep', name: '沉睡', type: '负面状态', icon: 'icons/buff_icons/sleepy_2.webp', desc: '堆叠上限：1\n维持效果：瞬爆\n拥有沉睡的角色在自己的进攻回合开始时立刻苏醒，恢复10点生命（不超过生命上限）。同时被进攻时会跳过防御阶段，所有伤害直接结算。' },
    { key: 'thorns', name: '荆棘', type: '负面状态', icon: 'icons/buff_icons/thorns.webp', desc: '堆叠上限：1\n维持效果：持续\n每个进攻回合最多触发2次：释放进攻技能时立即受到1点独立伤害（不可用守护/飞翔减免）；图标右上角数字为本回合剩余触发次数；可被净化。' },
    { key: 'quicksand', name: '流沙', type: '负面状态', icon: 'icons/buff_icons/quicksand.webp', desc: '堆叠上限：1\n维持效果：持续\n拥有流沙的角色手牌上限减少1张；回合结束时按降低后的上限弃牌和补牌。不会立即弃掉现有手牌；可被普通净化、超级净化清除，清除后恢复原上限。' },
    { key: 'sandblind', name: '沙盲', type: '负面状态', icon: 'icons/buff_icons/sandblind.webp', desc: '堆叠上限：6\n维持效果：持续\n进攻触发技能时立刻投掷12面骰：若结果≤2×层数则本次技能落空（对手跳过防御）。判定通过层数-1，判定失败层数-2（不足则扣至0）。6层时必定失败；可被净化（每次净化减1层）。' },
    { key: 'bloodthirst', name: '嗜血', type: '印记', icon: 'icons/buff_icons/blood_thirsty.webp', desc: '堆叠上限：1\n维持效果：永久\nSerenity专属嗜血印记。生命低于25时获得；同场战斗内恢复不会移除；冒险离房结算后生命高于25则清除。不能被净化或超级净化清除。未获得印记时，正常恢复额外+1生命；嗜血后技能按嗜血规则结算。' },
    { key: 'taunt', name: '嘲弄', type: '印记', icon: 'icons/buff_icons/mock.webp', desc: '堆叠上限：1\n维持效果：整段防御阶段\n嘲风鬣狗印记。进入防御阶段获得并用12面骰选色（1–3红/4–6黄/7–9蓝/10–12绿），以🔴🟡🔵🟢标出本阶段失效进攻色；该色进攻全空，鬣狗无需防御。鬣狗进入进攻阶段时清除。不可被净化。' }
  ];

  // 主角图鉴：仅展示玩家可选择的角色（排除冒险 NPC、领主专属和测试用角色）。
  const PLAYER_CHARS = [
    { name: 'Ryan', hp: 50, type: '战士', passive: '进攻回合开始前恢复1点生命', avatar: 'avatars/Ryan.webp', color: '#14eb5f' },
    { name: 'Leon', hp: 70, type: '骑士', passive: '免疫灼伤', avatar: 'avatars/Leon.webp', color: '#ee1111' },
    { name: 'Chan', hp: 60, type: '谋士', passive: '进攻回合开始前抽1张牌', avatar: 'avatars/Chan.webp', color: '#1399f2' },
    { name: 'Saiki', hp: 60, type: '猎手', passive: '进攻打出有效黄色牌时，防御结算后施加1层流血', avatar: 'avatars/Saiki.webp', color: '#9b59b6' },
    { name: 'Blaze', hp: 65, type: '狂战', passive: '自身有灼伤时，1至7牌的攻击伤害+1', avatar: 'avatars/Blaze.webp', color: '#e67e22' },
    { name: 'Serenity', hp: 50, type: '暗影', passive: '免疫冷冻；生命低于25获得不可净化的嗜血印记；离房时生命高于25则清除；无印记时恢复额外+1', avatar: 'avatars/Serenity.webp', color: '#1abc9c' },
    { name: 'Moze', hp: 80, type: '守护', passive: '可消耗守护减免攻击与反击伤害（不含Buff伤害）', avatar: 'avatars/Moze.webp', color: '#7f8c8d' },
    { name: 'Knight', hp: 70, type: '混沌', passive: '进攻前清除混沌；打出数字/白道具牌获得对应颜色混沌', avatar: 'avatars/Knight.webp', color: '#8e44ad' },
    { name: 'Otto', hp: 80, type: '战士', passive: '进攻伤害>4时可消耗1层[暴击]使攻击不可防御', avatar: 'avatars/Otto.webp', color: '#d35400' },
    { name: 'Vixraps', hp: 65, type: '灼热', passive: '打出黑牌后须弃1张（无手牌可免），然后回复2生命并对对手施加1层灼伤', avatar: 'avatars/Vixraps.webp', color: '#c0392b' }
  ];

  const PLAYER_SKILL_GRID = [
    { atkKey: 0, defKey: 0, label: '1' },
    { atkKey: 1, defKey: 1, label: '2' },
    { atkKey: 2, defKey: 2, label: '3' },
    { atkKey: 7, defKey: 3, label: '0' },
    { atkKey: 3, defKey: -1, label: '4' },
    { atkKey: 4, defKey: -1, label: '5' },
    { atkKey: 5, defKey: -1, label: '6' },
    { atkKey: 6, defKey: -1, label: '7' }
  ];

  function stripPrefix(s) {
    return (s || '').replace(/^\d+\s*/, '');
  }

  const BUFF_BY_NAME = (() => {
    const map = Object.create(null);
    for (const b of BUFF_DATA) map[b.name] = b;
    return map;
  })();

  /**
   * Normalize keywords to [中括号] form so colorize/parseSegments can tint them.
   * No in-text navigation links.
   */
  function tagifyKeywords(text) {
    let out = String(text || '');
    out = out.replace(/【([^】]+)】/g, '[$1]');
    // 数值+点生命/伤害 → N[生命]/N[伤害]（避免误伤「生命上限」）
    out = out.replace(/(\d+)\s*点生命/g, '$1[生命]');
    out = out.replace(/(\d+)\s*点伤害/g, '$1[伤害]');
    out = out.replace(/点生命/g, '[生命]');
    out = out.replace(/点伤害/g, '[伤害]');
    const names = BUFF_DATA.map(b => b.name).sort((a, b) => b.length - a.length);
    for (const name of names) {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`(?<!\\[)${esc}(?!\\])`, 'g'), '[' + name + ']');
    }
    return out;
  }

  function formatCodexRichText(text) {
    const boldParts = [];
    let raw = String(text || '').replace(/\*\*([^*]+)\*\*/g, (_, m) => {
      boldParts.push(m);
      return `\x00${boldParts.length - 1}\x00`;
    });
    raw = colorize(tagifyKeywords(raw));
    return raw.replace(/\x00(\d+)\x00/g, (_, i) => `<strong>${boldParts[Number(i)]}</strong>`);
  }

  function formatCodexSkillText(text) {
    return colorize(tagifyKeywords(stripPrefix(text)));
  }

  /** Notes that only document a buff's rules belong in Buff 图鉴, not monster notes. */
  function buffKeyFromEncyclopediaTitle(title) {
    const t = String(title || '').trim();
    for (const b of BUFF_DATA) {
      if (t === b.name) return b.key;
      if (t.startsWith(b.name + '（') || t.startsWith(b.name + '(')) return b.key;
      // 「暴击机制」等标题只复述统一 buff 规则，归 Buff 图鉴。
      if (t === b.name + '机制' || t === b.name + '规则') return b.key;
    }
    return null;
  }

  function colorize(text) {
    if (typeof parseSegments !== 'function') return text;
    const segs = parseSegments(text, '');
    return typeof skillSegmentsToHtml === 'function'
      ? skillSegmentsToHtml(segs)
      : segs.map(s => s.color ? `<span style="color:${s.color}">${s.text}</span>` : s.text).join('');
  }

  function resolveIcon(icon) {
    if (!icon) return '';
    if (icon.startsWith('http') || icon.startsWith('data:')) return icon;
    const relative = icon.startsWith('../') ? icon.substring(3) : icon;
    return window.gameAssetUrl ? window.gameAssetUrl(relative) : relative;
  }

  function makeSkillCard(value) {
    if (window.AdventureDeck && typeof window.AdventureDeck.num === 'function') {
      return window.AdventureDeck.num('RED', value, false);
    }
    return { value, color: 'RED', isNumberCard: true, isWhite: false, isItemCard: false };
  }

  // 以冒险模式注册表和 castle/forest 中实际使用的技能函数为唯一来源，
  // 避免图鉴继续读取普通模式里已经过时的 SKILL_DATA 文案。
  function adventureSkillArrays(name, stage) {
    const getDesc = window.AdventureMonsterBridge && window.AdventureMonsterBridge.getAdventureNpcSkillDesc;
    if (typeof getDesc !== 'function') return { atk: [], def: [] };
    const atk = NPC_SKILL_VALUES.map(value => getDesc(name, makeSkillCard(value), false, { stage }) || '无进攻效果');
    const def = NPC_SKILL_VALUES.map(value => getDesc(name, makeSkillCard(value), true, { stage }) || '无防御效果');
    return { atk, def };
  }

  function npcSkillGrid(includeZero) {
    return includeZero ? NPC_SKILL_GRID : NPC_SKILL_GRID.filter(row => row.label !== '0');
  }

  function collectionSubhead(count, description) {
    return `<div class="codex-collection-subhead"><span class="codex-collection-count">${count} 项</span><p>${description}</p></div>`;
  }

  function buildCategoryPage() {
    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back">&larr; 返回</button><h1 class="rules-title">图鉴</h1></div>';
    const registry = window.AdventureRegistry;
    const consumables = registry ? registry.allItems().filter(it => it.kind === 'consumable').length : 0;
    const accessories = registry ? registry.allItems().filter(it => it.kind === 'accessory').length : 0;
    const trophies = registry ? registry.allItems().filter(it => it.kind === 'trophyWhite').length : 0;
    const monsterCount = registry
      ? registry.allMonsters().length + registry.allBosses().length
      : 0;
    const counts = {
      player: PLAYER_CHARS.length,
      monster: monsterCount,
      consumable: consumables,
      accessory: accessories,
      trophyWhite: trophies,
      buff: BUFF_DATA.length
    };
    const categories = [
      ['player', '🎭', '主角图鉴', '角色技能与被动'],
      ['monster', '👹', '怪物图鉴', '按场景浏览普通、精英与首领'],
      ['consumable', '🧪', '道具图鉴', '冒险中可用的消耗品'],
      ['accessory', '💍', '饰品图鉴', '持续生效的冒险装备'],
      ['trophyWhite', '🃏', '战利白卡', '掉落、锻造与双源卡牌'],
      ['buff', '✨', 'Buff图鉴', '状态、层数与持续方式']
    ];
    html += '<div class="codex-category-grid">';
    for (const [key, icon, name, description] of categories) {
      html += `<button type="button" class="codex-category-card" data-cat="${key}"><span class="codex-category-icon">${icon}</span><span class="codex-category-copy"><span class="codex-category-name">${name}</span><span class="codex-category-desc">${description}</span></span><span class="codex-category-count">${counts[key]}</span><span class="codex-category-arrow" aria-hidden="true">›</span></button>`;
    }
    html += '</div></div>';
    return html;
  }

  function buildPlayerCharList() {
    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back-cat">&larr; 图鉴分类</button><h1 class="rules-title">主角图鉴</h1></div>';
    html += collectionSubhead(PLAYER_CHARS.length, '选择一位主角，查看生命值、被动能力与牌面技能。');
    html += '<div class="char-detail-grid">';
    for (const ch of PLAYER_CHARS) {
      html += `<button type="button" class="char-detail-card" data-name="${ch.name}" style="--character-accent:${ch.color}">
        <img class="char-detail-avatar" src="${ch.avatar}" alt="${ch.name}">
        <span class="char-detail-name">${ch.name}</span>
        <span class="char-detail-type">${ch.type}</span>
        <span class="char-detail-open">查看技能 <span aria-hidden="true">›</span></span>
      </button>`;
    }
    html += '</div></div>';
    return html;
  }

  function buildPlayerCharDetail(name) {
    const ch = PLAYER_CHARS.find(c => c.name === name);
    if (!ch) return '';
    const skillData = window.SKILL_DATA || (typeof SKILL_DATA !== 'undefined' ? SKILL_DATA : null);
    const atk = (skillData && skillData.attack && skillData.attack[name]) || [];
    const def = (skillData && skillData.defend && skillData.defend[name]) || [];

    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back-list">&larr; 主角列表</button><h1 class="rules-title">主角图鉴</h1></div>';

    html += `<div class="char-detail-hero" style="--character-accent:${ch.color}">
      <img class="char-detail-hero-avatar" src="${ch.avatar}" alt="${ch.name}">
      <div class="char-detail-hero-info">
        <div class="char-detail-hero-name">${ch.name}</div>
        <div class="char-detail-hero-type">${ch.type} · HP ${ch.hp}</div>
        <div class="char-detail-hero-passive">被动：${ch.passive}</div>
      </div>
    </div>`;

    html += '<div class="skill-grid-caption"><span>进攻</span><span>点数</span><span>防御</span></div><div class="skill-grid">';
    for (const row of PLAYER_SKILL_GRID) {
      const atkDesc = atk[row.atkKey] ? colorize(stripPrefix(atk[row.atkKey])) : '—';
      const defDesc = row.defKey >= 0 && def[row.defKey] ? colorize(stripPrefix(def[row.defKey])) : (row.defKey >= 0 ? '无防御效果' : '');
      html += `<div class="skill-row">`;
      html += `<div class="skill-cell skill-atk">${atkDesc}</div>`;
      html += `<div class="skill-num">${row.label}</div>`;
      if (row.defKey >= 0) {
        html += `<div class="skill-cell skill-def">${defDesc}</div>`;
      } else {
        html += `<div class="skill-cell skill-def skill-no-def"></div>`;
      }
      html += '</div>';
    }
    html += '</div>';
    html += '<div class="skill-footnote">🗡️伤害 ❤️生命 🛡️格挡 🃏卡牌 · 小数均向上取整</div>';
    html += '</div>';
    return html;
  }

  function isCodexEliteMonster(name) {
    const loot = window.AdventureLoot;
    return !!(name && loot && typeof loot.isEliteMonster === 'function' && loot.isEliteMonster(name));
  }

  const CODEX_SCENES = [
    { key: 'castle', label: '城堡' },
    { key: 'forest', label: '森林' },
    { key: 'ocean', label: '冻洋' },
    { key: 'desert', label: '沙漠' },
    { key: 'volcano', label: '火山' },
    { key: 'final', label: '终局' }
  ];

  function buildMonsterSceneMap() {
    const map = Object.create(null);
    const add = (scene, names) => {
      for (const name of names) {
        if (name && !map[name]) map[name] = scene;
      }
    };
    for (const [scene, pool] of Object.entries(window.AdventureMonsterPool || {})) {
      const names = [];
      if (pool['*']) names.push(...pool['*']);
      for (const [stage, list] of Object.entries(pool)) {
        if (stage !== '*') names.push(...list);
      }
      add(scene, names);
    }
    for (const [scene, pool] of Object.entries(window.AdventureElitePool || {})) {
      add(scene, Object.values(pool).flat());
    }
    for (const [scene, pool] of Object.entries(window.AdventureBossPool || {})) {
      add(scene, Object.values(pool).flat());
    }
    map.CorruptedRyan = 'final';
    return map;
  }

  function sortCodexMonsters(list) {
    return list.slice().sort((a, b) => String(a.kind || a.name || '').localeCompare(String(b.kind || b.name || ''), 'zh'));
  }

  function codexTierLabel(tier) {
    if (tier === 'elite') return '精英怪物';
    if (tier === 'boss') return '首领';
    return '普通怪物';
  }

  function monsterCardMarkup(m, tier) {
    const tierLabel = codexTierLabel(tier);
    const icon = resolveIcon(m.icon);
    const iconHtml = icon
      ? `<img class="char-detail-avatar" src="${icon}" onerror="this.style.display='none'" alt="${m.name}">`
      : `<div class="char-detail-avatar codex-no-icon">${m.name[0]}</div>`;
    let extraClass = '';
    if (tier === 'elite') extraClass = ' codex-elite-card';
    else if (tier === 'boss') extraClass = ' codex-boss-card';
    return `<button type="button" class="char-detail-card codex-creature-card${extraClass}" data-name="${m.name}">${iconHtml}` +
      `<span class="char-detail-name">${m.kind || m.name}</span>` +
      `<span class="char-detail-type">${tierLabel} · HP ${m.hp}</span>` +
      '<span class="char-detail-open">查看技能 <span aria-hidden="true">›</span></span></button>';
  }

  function getCodexCreature(name) {
    const registry = window.AdventureRegistry;
    if (!registry || !name) return null;
    const monster = registry.getMonster(name);
    if (monster) {
      return { entity: monster, tier: isCodexEliteMonster(name) ? 'elite' : 'normal' };
    }
    const boss = registry.getBoss(name);
    if (boss) return { entity: boss, tier: 'boss' };
    return null;
  }

  function buildMonsterList() {
    const registry = window.AdventureRegistry;
    const monsters = registry ? registry.allMonsters() : [];
    const bosses = registry ? registry.allBosses() : [];
    const total = monsters.length + bosses.length;
    const sceneMap = buildMonsterSceneMap();
    const tierSections = [
      { tier: 'normal', title: '普通', hint: '普通房、挑战房等', pick: sceneKey =>
        sortCodexMonsters(monsters.filter(m => sceneMap[m.name] === sceneKey && !isCodexEliteMonster(m.name))) },
      { tier: 'elite', title: '精英', hint: '精英房（Stage 3–4）· 战利骰投 2 次', pick: sceneKey =>
        sortCodexMonsters(monsters.filter(m => sceneMap[m.name] === sceneKey && isCodexEliteMonster(m.name))) },
      { tier: 'boss', title: '首领', hint: 'Boss 房', pick: sceneKey =>
        sortCodexMonsters(bosses.filter(b => sceneMap[b.name] === sceneKey)) }
    ];
    let html = '<div class="char-detail-page codex-monster-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back-cat">&larr; 图鉴分类</button><h1 class="rules-title">怪物图鉴</h1></div>';
    html += collectionSubhead(total, '按场景浏览普通、精英与首领的技能、规则与战利品。');
    for (const scene of CODEX_SCENES) {
      const sceneCount = monsters.filter(m => sceneMap[m.name] === scene.key).length
        + bosses.filter(b => sceneMap[b.name] === scene.key).length;
      if (!sceneCount) continue;
      html += `<section class="codex-monster-scene" data-codex-scene="${scene.key}" aria-labelledby="codex-scene-${scene.key}">`;
      html += `<header class="codex-monster-scene-head"><h2 id="codex-scene-${scene.key}">${scene.label}<span>${sceneCount} 种</span></h2></header>`;
      for (const section of tierSections) {
        const list = section.pick(scene.key);
        if (!list.length) continue;
        html += `<div class="codex-monster-section" data-monster-tier="${section.tier}">`;
        html += '<header class="codex-monster-section-head">';
        html += `<div><h3>${section.title}<span>${list.length} 种</span></h3><p>${section.hint}</p></div></header>`;
        html += '<div class="char-detail-grid">';
        html += list.map(m => monsterCardMarkup(m, section.tier)).join('');
        html += '</div></div>';
      }
      html += '</section>';
    }
    html += '</div>';
    return html;
  }

  function collectSpecialNotes(entity, name, opts) {
    const fromMd = (window.AdventureMonsterNotes && window.AdventureMonsterNotes[name]) || [];
    const notes = [];
    const dropNotes = [];
    for (const n of fromMd) {
      if (buffKeyFromEncyclopediaTitle(n.title)) continue;
      const lines = (n.lines || []).slice();
      // Drop lines that are only a buff encyclopedia blurb: "[茂盛]：正面 buff…"
      const kept = lines.filter(line => {
        const m = String(line).match(/^\[([^\]]+)\][：:]/);
        if (m && BUFF_BY_NAME[m[1]]) return false;
        return true;
      });
      const entry = kept.length ? { title: n.title, lines: kept } : (!lines.length ? { title: n.title, lines: [] } : null);
      if (!entry) continue;
      if (/掉落/.test(String(n.title || ''))) dropNotes.push(entry);
      else notes.push(entry);
    }
    const hasTitle = re => notes.some(n => re.test(n.title) || n.lines.some(l => re.test(l)))
      || dropNotes.some(n => re.test(n.title) || n.lines.some(l => re.test(l)));
    const pushAuto = (title, line, bucket = notes) => {
      if (!line) return;
      if (notes.some(n => n.lines.includes(line))) return;
      if (dropNotes.some(n => n.lines.includes(line))) return;
      const existing = bucket.find(n => n.title === title);
      if (existing) {
        if (!existing.lines.includes(line)) existing.lines.push(line);
      } else {
        bucket.push({ title, lines: [line] });
      }
    };
    if (entity.firstStrike && !hasTitle(/先攻|先手/)) {
      pushAuto('被动', '先手攻击：战斗开始时对手先行进攻，玩家不补起始手牌');
    }
    if (entity.initialLush && !hasTitle(/茂盛|开局/)) {
      pushAuto('被动', '开局获得' + entity.initialLush + '层[茂盛]');
    }
    if (entity.noAttack && !hasTitle(/无进攻|跳过进攻/)) {
      pushAuto('被动', entity.attackSkipDescription || '无进攻阶段');
    } else if (entity.attackSkipDescription && !hasTitle(/跳过进攻|中毒/)) {
      pushAuto('被动', entity.attackSkipDescription);
    }
    if (entity.canDefendHigh && !hasTitle(/高牌|4\/5\/6/)) {
      pushAuto('被动', '可用高牌（4/5/6/7）防御');
    }
    // Boss 手牌上限是牌库注册配置，不是被动（desert.md：鬣狗/阿努比斯等）
    const isBoss = !!(window.AdventureRegistry && typeof window.AdventureRegistry.getBoss === 'function'
      && window.AdventureRegistry.getBoss(name));
    if (!isBoss && entity.handLimit && entity.handLimit < 4 && !hasTitle(/手牌/)) {
      pushAuto('被动', '手牌上限 ' + entity.handLimit + ' 张');
    }
    if (window.AdventureLoot && typeof window.AdventureLoot.describeMonsterDrop === 'function' && !hasTitle(/掉落/)) {
      const eliteDrop = !!(opts && opts.elite);
      const dropLine = window.AdventureLoot.describeMonsterDrop(name, eliteDrop ? { elite: true } : undefined);
      if (dropLine) pushAuto('掉落', dropLine, dropNotes);
    }
    return { notes, dropNotes };
  }

  function renderNoteBlocks(notes) {
    let html = '';
    for (const note of notes) {
      html += '<div class="codex-note-block">';
      html += `<div class="codex-note-heading">${formatCodexRichText('**' + note.title + '**')}</div>`;
      if (note.lines && note.lines.length) {
        html += '<ul class="codex-note-list">';
        for (const line of note.lines) {
          html += `<li class="codex-note-item">${formatCodexRichText(line)}</li>`;
        }
        html += '</ul>';
      }
      html += '</div>';
    }
    return html;
  }

  function buildSpecialNotesFromList(notes) {
    if (!notes.length) return '';
    let html = '<div class="codex-notes-section">';
    html += '<div class="codex-notes-title">特殊说明</div>';
    html += renderNoteBlocks(notes);
    html += '</div>';
    return html;
  }

  function buildDropNotesFromList(dropNotes) {
    if (!dropNotes.length) return '';
    let html = '<div class="codex-notes-section codex-drop-section">';
    html += '<div class="codex-notes-title">掉落</div>';
    // Auto loot lines already use title「掉落」; skip the duplicate heading.
    for (const note of dropNotes) {
      html += '<div class="codex-note-block">';
      if (note.title && note.title !== '掉落') {
        html += `<div class="codex-note-heading">${formatCodexRichText('**' + note.title + '**')}</div>`;
      }
      if (note.lines && note.lines.length) {
        html += '<ul class="codex-note-list">';
        for (const line of note.lines) {
          html += `<li class="codex-note-item">${formatCodexRichText(line)}</li>`;
        }
        html += '</ul>';
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function buildMonsterDetail(name) {
    const found = getCodexCreature(name);
    if (!found) return '';
    const { entity: m, tier } = found;
    const skills = adventureSkillArrays(name, 1);
    const icon = resolveIcon(m.icon);
    const iconHtml = icon ? `<img class="char-detail-hero-avatar" src="${icon}" onerror="this.style.display='none'" alt="${m.name}">` : `<div class="char-detail-hero-avatar codex-no-icon">${m.name[0]}</div>`;
    const elite = tier === 'elite';
    const { notes, dropNotes } = collectSpecialNotes(m, name, elite ? { elite: true } : undefined);
    const tierLabel = codexTierLabel(tier);

    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back-list">&larr; 怪物列表</button><h1 class="rules-title">怪物图鉴</h1></div>';
    html += `<div class="codex-detail-kicker">冒险图鉴 <span>${tierLabel}</span></div>`;
    html += `<div class="char-detail-hero">${iconHtml}<div class="char-detail-hero-info">`;
    html += `<div class="char-detail-hero-name">${m.kind || m.name}</div>`;
    html += `<div class="char-detail-hero-type">${tierLabel} · HP ${m.hp}${m.handLimit ? ' · 手牌' + m.handLimit : ''}</div>`;
    html += `</div></div>`;

    html += buildSpecialNotesFromList(notes);
    html += buildDropNotesFromList(dropNotes);
    if (skills.atk.length || skills.def.length) {
      html += buildSkillGrid(skills.atk, skills.def, !!m.canDefendHigh, !!m.whiteZeros);
    }
    html += buildStageMods(name);
    html += '</div>';
    return html;
  }

  function buildBossList() {
    return buildMonsterList();
  }

  function buildBossDetail(name) {
    return buildMonsterDetail(name);
  }

  function buildItemList(kind) {
    const allItems = window.AdventureRegistry ? window.AdventureRegistry.allItems() : [];
    const items = allItems.filter(it => it.kind === kind);
    const title = kind === 'consumable' ? '道具图鉴' : '饰品图鉴';
    let html = '<div class="char-detail-page">';
    html += `<div class="rules-header"><button class="rules-back-btn" id="codex-back-cat">&larr; 图鉴分类</button><h1 class="rules-title">${title}</h1></div>`;
    html += collectionSubhead(items.length, kind === 'consumable' ? '按效果与使用场景浏览冒险道具。' : '查看饰品效果、属性加成与兑换消耗。');
    if (!items.length) {
      html += '<div class="codex-empty">暂无数据</div>';
    } else {
      html += '<div class="codex-all-list">';
      for (const it of items) {
        const icon = resolveIcon(it.icon);
        const iconHtml = icon ? `<img class="char-detail-avatar" src="${icon}" onerror="this.style.display='none'" alt="${it.displayName}">` : `<div class="char-detail-avatar codex-no-icon">${it.displayName[0]}</div>`;
        const kindLabel = it.kind === 'consumable' ? '一次性道具' : '配饰';
        const price = it.kind === 'accessory' ? (it.price || 15) : (it.price || 0);
        const useSceneLabel = it.useScene === 'both' ? '（地图/战斗均可使用）' : it.useScene === 'combat' ? '（战斗中使用）' : it.useScene === 'map' ? '（地图使用）' : '';
        const stackLabel = it.kind === 'accessory' && it.maxStacks
          ? ' · 上限' + it.maxStacks
          : '';
        html += `<article class="codex-all-item codex-item-entry">`;
        html += `<div class="codex-all-item-header">${iconHtml}<div class="codex-all-item-info"><span class="codex-all-item-name">${it.displayName}</span><span class="codex-all-item-meta">${kindLabel} · ${price}金币${stackLabel}${useSceneLabel}</span></div></div>`;
        const descText = window.descToEmoji ? window.descToEmoji(it.description || '') : (it.description || '无描述');
        html += `<div class="codex-all-item-desc">${descText}</div>`;
        if (it.statBonus) {
          const statEntries = Object.entries(it.statBonus).filter(([k]) => k !== 'handLimitBonus');
          if (statEntries.length) {
            html += '<div class="codex-stat-bonus">';
            html += '<div class="codex-stat-list">';
            for (const [k, v] of statEntries) {
              const label = k === 'maxHp' ? '生命上限' : k === 'dropRateBonus' ? '掉落概率' : k;
              html += `<span class="codex-stat-chip">${label}+${v}</span>`;
            }
            html += '</div></div>';
          }
        }
        if (it.kind === 'accessory' && it.beastTradeCost && it.beastTradeCost.length) {
          html += '<div class="codex-stat-bonus"><div class="codex-stat-list">';
          const beastNames = { huo: '火兽元', shui: '水兽元', cao: '草兽元', ben: '本兽元', wuneng: '万能兽元' };
          const beastColors = { huo: '#ff5555', shui: '#55aaff', cao: '#55cc55', ben: '#ffcc44', wuneng: '#cc88ff' };
          const costMap = {};
          for (const t of it.beastTradeCost) costMap[t] = (costMap[t] || 0) + 1;
          const parts = [];
          for (const [k, v] of Object.entries(costMap)) {
            parts.push(`${v}<span style="color:${beastColors[k] || '#ccc'}">[${beastNames[k] || k}]</span>`);
          }
          html += `<span class="codex-stat-chip">铁匠铺兑换：${parts.join(' ')}</span>`;
          if (it.breaksOnTrigger) {
            html += '<span class="codex-stat-chip">触发后损坏消失</span>';
          }
          html += '</div></div>';
        }
        html += '</article>';
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function trophyCardObject(name, kind) {
    return {
      value: -1,
      color: 'WHITE',
      isWhite: true,
      isBlack: false,
      isNumberCard: false,
      isItemCard: true,
      trophyWhite: true,
      trophyName: name,
      trophyKind: kind || ''
    };
  }

  function trophyCostMarkup(it) {
    if (it.trophyKind === 'drop' || !it.beastTradeCost || !it.beastTradeCost.length) return '';
    const beastNames = { huo: '火兽元', shui: '水兽元', cao: '草兽元', ben: '本兽元', wuneng: '万能兽元' };
    const costMap = {};
    for (const t of it.beastTradeCost) costMap[t] = (costMap[t] || 0) + 1;
    const parts = [];
    for (const [k, v] of Object.entries(costMap)) {
      parts.push(`<span class="codex-trophy-token" data-beast="${k}">${beastNames[k] || k}<b>×${v}</b></span>`);
    }
    return '<div class="codex-trophy-cost"><span class="codex-trophy-cost-label">锻造消耗</span><div class="codex-trophy-tokens">' + parts.join('') + '</div></div>';
  }

  function trophySourceSymbol(kind) {
    const paths = kind === 'drop'
      ? '<path d="M8 3v7m-3-3 3 3 3-3M3 11v2h10v-2"/>'
      : '<path d="m5 12 5-7M7 3l5 3-2 3-5-3Z"/>';
    return `<svg class="codex-trophy-source-icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  }

  function trophyEntryMarkup(it) {
    // Shared cycling rules sit below the direct card action; buff mechanics are
    // intentionally left to the separate buff codex.
    const effectText = String(it.description || '').replace(/(?:抽1张牌，可继续搭桥|不抽牌，可继续搭桥|不抽牌，不继续搭桥)。?$/, '').replace(/。$/, '');
    const zero = it.trophyEffect === 'zero';
    const noDraw = zero || it.drawCount === 0;
    const drawLabel = noDraw ? '不抽牌' : it.trophyEffect === 'drawTwo' ? '抽牌 +2' : '抽牌 +1';
    const name = it.displayName.replace(/战利白卡$/, '');
    return `<article class="codex-trophy-entry" aria-label="${it.displayName}">` +
      `<span class="codex-trophy-face-slot" data-codex-trophy="${it.name}" data-codex-kind="${it.trophyKind || ''}"></span>` +
      '<div class="codex-trophy-copy">' +
      `<h3 class="codex-trophy-name">${name}</h3>` +
      `<p class="codex-trophy-effect">${formatCodexRichText(effectText)}</p>` +
      `<div class="codex-trophy-play-rules${zero ? ' is-exception' : ''}"><span>${drawLabel}</span><span>${zero ? '不继续搭桥' : '可继续搭桥'}</span></div>` +
      trophyCostMarkup(it) + '</div></article>';
  }

  function buildTrophyList() {
    const allItems = window.AdventureRegistry ? window.AdventureRegistry.allItems() : [];
    const items = allItems.filter(it => it.kind === 'trophyWhite');
    const sections = [
      { kind: 'drop', title: '掉落白卡', hint: '怪物战利品 · 左上角标' },
      { kind: 'forge', title: '锻造白卡', hint: '铁匠铺制作 · 右上角标' },
      { kind: 'both', title: '双源白卡', hint: '掉落与锻造均可获得 · 双角标' }
    ];
    let html = '<div class="char-detail-page codex-trophy-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back-cat">&larr; 图鉴分类</button><h1 class="rules-title">战利白卡</h1></div>';
    if (!items.length) {
      html += '<div class="codex-empty">暂无数据</div>';
    } else {
      html += '<section class="codex-trophy-intro" aria-label="战利白卡使用规则">';
      html += `<div class="codex-trophy-intro-top"><span>冒险牌组收藏</span><span>共 ${items.length} 张</span></div>`;
      html += '<h2>加入牌组，循环使用</h2><p>获得后加入手牌，不占道具槽。打出后进入弃牌库，洗回后可再次抽到。</p>';
      html += '<div class="codex-trophy-legend"><span class="is-drop">' + trophySourceSymbol('drop') + '左上 · 掉落</span><span class="is-forge">' + trophySourceSymbol('forge') + '右上 · 锻造</span><span>' + trophySourceSymbol('drop') + trophySourceSymbol('forge') + '双角标 · 双源</span></div>';
      html += '</section>';
      sections.forEach((section) => {
        const list = items.filter(it => it.trophyKind === section.kind)
          .sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''), 'zh'));
        html += `<section class="codex-trophy-section" data-trophy-kind="${section.kind}" aria-labelledby="codex-trophy-${section.kind}">`;
        html += `<header class="codex-trophy-section-head"><div><h2 id="codex-trophy-${section.kind}">${section.title}<span>${list.length} 张</span></h2><p>${section.hint}</p></div></header>`;
        html += '<div class="codex-trophy-grid">';
        html += list.map(it => trophyEntryMarkup(it)).join('') || '<div class="codex-empty">暂无</div>';
        html += '</div></section>';
      });
    }
    html += '</div>';
    return html;
  }

  function mountCodexTrophyCards(root) {
    if (!root || typeof window.renderCard !== 'function') return;
    const width = 88, height = 128;
    root.querySelectorAll('.codex-trophy-face-slot').forEach(slot => {
      try {
        const name = slot.getAttribute('data-codex-trophy');
        const card = trophyCardObject(name, slot.getAttribute('data-codex-kind'));
        const canvas = window.renderCard(card, width, height, false);
        canvas.classList.add('codex-trophy-face');
        slot.replaceChildren(canvas);
      } catch (err) {
        console.error(err);
      }
    });
  }

  function buildBuffList() {
    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back-cat">&larr; 图鉴分类</button><h1 class="rules-title">Buff图鉴</h1></div>';
    html += collectionSubhead(BUFF_DATA.length, '按状态类别浏览层数上限、持续方式与具体效果。');
    const groups = [
      { type: '负面状态', title: '负面状态' },
      { type: '正面状态', title: '正面状态' },
      { type: '印记', title: '特殊印记', hint: '不可净化' }
    ];
    for (const group of groups) {
      const list = BUFF_DATA.filter(buff => buff.type === group.type);
      html += `<section class="codex-encyclopedia-section" data-status-type="${group.type}">`;
      html += `<header class="codex-encyclopedia-head"><h2>${group.title}</h2><span>${list.length} 项${group.hint ? ' · ' + group.hint : ''}</span></header>`;
      html += '<div class="codex-all-list codex-buff-grid">';
      for (const buff of list) {
      const icon = resolveIcon(buff.icon);
      const iconHtml = icon ? `<img class="char-detail-avatar" src="${icon}" onerror="this.style.display='none'" alt="${buff.name}">` : `<div class="char-detail-avatar codex-no-icon">${buff.name[0]}</div>`;
      html += `<article class="codex-all-item codex-buff-entry">`;
      html += `<div class="codex-all-item-header">${iconHtml}<div class="codex-all-item-info"><span class="codex-all-item-name">${buff.name}</span><span class="codex-all-item-meta">${group.hint || buff.type}</span></div></div>`;
      const descLines = String(buff.desc || '').split('\n').filter(Boolean);
      const cap = descLines.find(line => line.startsWith('堆叠上限：'));
      const duration = descLines.find(line => line.startsWith('维持效果：'));
      const details = descLines.filter(line => line !== cap && line !== duration);
      if (cap || duration) {
        html += '<div class="codex-buff-facts">';
        if (cap) html += `<span>${formatCodexRichText(cap.replace('堆叠上限：', '上限：'))}</span>`;
        if (duration) html += `<span>${formatCodexRichText(duration.replace('维持效果：', '持续：'))}</span>`;
        html += '</div>';
      }
      if (details.length) html += `<div class="codex-buff-description">${details.map(line => formatCodexRichText(line)).join('<br>')}</div>`;
      html += '</article>';
      }
      html += '</div></section>';
    }
    html += '</div>';
    return html;
  }

  function buildSkillGrid(atk, def, canDefendHigh = false, includeZero = false) {
    if (!atk.length && !def.length) return '';
    let html = '<div class="skill-grid-caption"><span>进攻</span><span>点数</span><span>防御</span></div><div class="skill-grid">';
    for (const row of npcSkillGrid(includeZero)) {
      const atkDesc = atk[row.atkKey] ? formatCodexSkillText(atk[row.atkKey]) : '—';
      const highDefKey = canDefendHigh && ['4', '5', '6', '7'].includes(row.label) ? row.atkKey : -1;
      const defKey = row.defKey >= 0 ? row.defKey : highDefKey;
      const defDesc = defKey >= 0 && def[defKey] ? formatCodexSkillText(def[defKey]) : (defKey >= 0 ? '无防御效果' : '');
      html += '<div class="skill-row">';
      html += `<div class="skill-cell skill-atk">${atkDesc}</div>`;
      html += `<div class="skill-num">${row.label}</div>`;
      if (defKey >= 0) {
        html += `<div class="skill-cell skill-def">${defDesc}</div>`;
      } else {
        html += '<div class="skill-cell skill-def skill-no-def"></div>';
      }
      html += '</div>';
    }
    html += '</div>';
    html += '<div class="skill-footnote">🗡️伤害 ❤️生命 🛡️格挡 🃏卡牌 · 小数均向上取整</div>';
    return html;
  }

  // Stage 强化文案以 guide md 为准（AdventureStageGuide），格式对齐：
  // **Stage 强化**： / - **Stage N**：…
  function buildStageMods(name) {
    const notes = (window.AdventureStageGuide && window.AdventureStageGuide[name]) || [];
    if (!notes.length) return '';
    let html = '<div class="codex-stage-section">';
    html += '<div class="codex-stage-title">Stage 强化</div>';
    html += '<ul class="codex-stage-list">';
    for (const note of notes) {
      html += `<li class="codex-stage-item"><strong>Stage ${note.stage}</strong>：${formatCodexRichText(note.text)}</li>`;
    }
    html += '</ul></div>';
    return html;
  }

  function showCategoryPage(container) {
    container.innerHTML = buildCategoryPage();
    container.classList.add('active');
    document.getElementById('select-screen').classList.remove('active');

    document.getElementById('codex-back').addEventListener('click', () => {
      container.classList.remove('active');
      document.getElementById('select-screen').classList.add('active');
    });

    container.querySelectorAll('.codex-category-card').forEach(el => {
      el.addEventListener('click', () => {
        const cat = el.dataset.cat;
        if (cat === 'player') showPlayerCharList(container);
        else if (cat === 'monster') showMonsterList(container);
        else if (cat === 'consumable') showItemList(container, 'consumable');
        else if (cat === 'accessory') showItemList(container, 'accessory');
        else if (cat === 'trophyWhite') showTrophyList(container);
        else if (cat === 'buff') showBuffList(container);
      });
    });
  }

  function showPlayerCharList(container) {
    container.innerHTML = buildPlayerCharList();
    document.getElementById('codex-back-cat').addEventListener('click', () => showCategoryPage(container));
    container.querySelectorAll('.char-detail-card').forEach(el => {
      el.addEventListener('click', () => showPlayerCharDetail(container, el.dataset.name));
    });
  }

  function showPlayerCharDetail(container, name) {
    container.innerHTML = buildPlayerCharDetail(name);
    document.getElementById('codex-back-list').addEventListener('click', () => showPlayerCharList(container));
  }

  function showMonsterList(container) {
    container.innerHTML = buildMonsterList();
    document.getElementById('codex-back-cat').addEventListener('click', () => showCategoryPage(container));
    container.querySelectorAll('.char-detail-card').forEach(el => {
      el.addEventListener('click', () => showMonsterDetail(container, el.dataset.name));
    });
  }

  function showMonsterDetail(container, name) {
    container.innerHTML = buildMonsterDetail(name);
    document.getElementById('codex-back-list').addEventListener('click', () => showMonsterList(container));
  }

  function showBossList(container) {
    container.innerHTML = buildBossList();
    document.getElementById('codex-back-cat').addEventListener('click', () => showCategoryPage(container));
    container.querySelectorAll('.char-detail-card').forEach(el => {
      el.addEventListener('click', () => showBossDetail(container, el.dataset.name));
    });
  }

  function showBossDetail(container, name) {
    container.innerHTML = buildBossDetail(name);
    document.getElementById('codex-back-list').addEventListener('click', () => showBossList(container));
  }

  function showItemList(container, kind) {
    container.innerHTML = buildItemList(kind);
    document.getElementById('codex-back-cat').addEventListener('click', () => showCategoryPage(container));
  }

  function showTrophyList(container) {
    container.innerHTML = buildTrophyList();
    document.getElementById('codex-back-cat').addEventListener('click', () => showCategoryPage(container));
    mountCodexTrophyCards(container);
    if (window.cardIconsReady && typeof window.cardIconsReady.then === 'function') {
      window.cardIconsReady.then(() => {
        if (container.querySelector('.codex-trophy-entry')) mountCodexTrophyCards(container);
      });
    }
  }

  function showBuffList(container) {
    container.innerHTML = buildBuffList();
    document.getElementById('codex-back-cat').addEventListener('click', () => showCategoryPage(container));
  }

  window.AdventureCodex = { show: showCategoryPage, buildTrophyList, paintTrophyCards: mountCodexTrophyCards };
})();
