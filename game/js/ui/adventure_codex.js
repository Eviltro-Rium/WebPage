/**
 * 冒险图鉴 —— 仿照 char_detail.js 的结构，展示怪物/Boss/道具/饰品/Buff图鉴。
 */
(function () {
  // 怪物/Boss NPC 牌堆：白1~3×5、白4~6×3（无白7）；Boss 另加白0。
  // atk/def 下标与 NPC_SKILL_VALUES 一一对应。
  const NPC_SKILL_VALUES = [1, 2, 3, 4, 5, 6, 0];
  const NPC_SKILL_GRID = [
    { atkKey: 0, defKey: 0, label: '1' },
    { atkKey: 1, defKey: 1, label: '2' },
    { atkKey: 2, defKey: 2, label: '3' },
    { atkKey: 6, defKey: 6, label: '0' },
    { atkKey: 3, defKey: -1, label: '4' },
    { atkKey: 4, defKey: -1, label: '5' },
    { atkKey: 5, defKey: -1, label: '6' }
  ];

  // 所有会在战斗界面显示的状态集中维护，避免规则页和冒险图鉴出现两套说明。
  // desc 三行：堆叠上限：n / 维持效果：衰减|持续|瞬爆 / 效果说明
  const BUFF_DATA = [
    { key: 'burn', name: '灼烧', type: '负面状态', icon: 'icons/buff_icons/burn.png', desc: '堆叠上限：5\n维持效果：衰减\n拥有灼烧的角色在自己的进攻回合结束时受到等同于层数的伤害，随后减少1层。' },
    { key: 'bleed', name: '流血', type: '负面状态', icon: 'icons/buff_icons/bleed.png', desc: '堆叠上限：3\n维持效果：衰减\n防御方用0~3点数字牌防御时，额外承受等同于[流血]层数的伤害，随后减少1层流血。' },
    { key: 'poison', name: '中毒', type: '负面状态', icon: 'icons/buff_icons/poison.png', desc: '堆叠上限：3\n维持效果：持续\n拥有中毒的角色在自己的进攻回合开始前受到等同于层数的伤害；层数不会自然减少，可被净化。' },
    { key: 'freeze', name: '冷冻', type: '负面状态', icon: 'icons/buff_icons/freeze.png', desc: '堆叠上限：1\n维持效果：持续\n无法防御蓝色攻击。受到蓝色攻击时只能跳过防御并承受全部伤害。' },
    { key: 'blind', name: '致盲', type: '负面状态', icon: 'icons/buff_icons/blind.png', desc: '堆叠上限：1\n维持效果：持续\n持续期间不能在战斗中使用一次性道具，只能等待被净化。' },
    { key: 'iceSeal', name: '冰封', type: '负面状态', icon: 'icons/buff_icons/ice_seal.png', desc: '堆叠上限：1\n维持效果：衰减\n有冰封的角色在下一次补牌时少补1张牌，随后移除1层冰封；可被净化。' },
    { key: 'bomb', name: '定时炸弹', type: '负面状态', icon: 'icons/buff_icons/time_bomb.png', desc: '堆叠上限：1\n维持效果：瞬爆\n初始倒计时为5。被施加者每打出1张牌倒计时减少1，归零时爆炸并受到5点伤害；可被净化。' },
    { key: 'guard', name: '守护', type: '正面状态', icon: 'icons/buff_icons/guard.png', desc: '堆叠上限：5\n维持效果：持续\n受到普通伤害时可消耗守护层数等额减免伤害；不能减免流血等特殊伤害。' },
    { key: 'fly', name: '飞翔', type: '正面状态', icon: 'icons/buff_icons/fly.png', desc: '堆叠上限：2\n维持效果：持续\n受到伤害时可消耗1层投掷12面骰，1~6成功躲避、7~12失败；失败后可继续尝试。不能躲避攻击附带的状态。' },
    { key: 'lush', name: '茂盛', type: '正面状态', icon: 'icons/buff_icons/lush.png', desc: '堆叠上限：2\n维持效果：持续\n每有1层，在自己进攻开始前恢复1点生命；可被净化移除。' },
    { key: 'parasite', name: '寄生', type: '正面状态', icon: 'icons/buff_icons/parasite.png', desc: '堆叠上限：1\n维持效果：持续\n在自己进攻开始前，吸取对手1点生命（不可用守护/飞翔/道具减免）；可被净化移除。' },
    { key: 'crit', name: '暴击', type: '正面状态', icon: 'icons/buff_icons/crit.png', desc: '堆叠上限：3\n维持效果：持续\n进攻时若伤害超过4点（防御前，不含流血；含攻击修正后），可在攻击修正/破防选择之后消耗1层，使该攻击变为不可防御；若攻击本身已不可防御则不能再使用。可被净化移除。' },
    { key: 'chaos_red', name: '混沌·红', type: '正面状态', icon: 'icons/buff_icons/chaos_red.png', desc: '堆叠上限：1\n维持效果：衰减\nKnight专属状态。打出红色数字牌并完成防御后获得，进攻回合开始前清除。' },
    { key: 'chaos_yellow', name: '混沌·黄', type: '正面状态', icon: 'icons/buff_icons/chaos_yellow.png', desc: '堆叠上限：1\n维持效果：衰减\nKnight专属状态。打出黄色数字牌并完成防御后获得，进攻回合开始前清除。' },
    { key: 'chaos_blue', name: '混沌·蓝', type: '正面状态', icon: 'icons/buff_icons/chaos_blue.png', desc: '堆叠上限：1\n维持效果：衰减\nKnight专属状态。打出蓝色数字牌并完成防御后获得，进攻回合开始前清除。' },
    { key: 'chaos_green', name: '混沌·绿', type: '正面状态', icon: 'icons/buff_icons/chaos_green.png', desc: '堆叠上限：1\n维持效果：衰减\nKnight专属状态。打出绿色数字牌并完成防御后获得，进攻回合开始前清除。' },
    { key: 'diving', name: '潜水', type: '正面状态', icon: 'icons/buff_icons/diving.png', desc: '堆叠上限：1\n维持效果：持续\n拥有潜水的角色免疫蓝色攻击（含被指定为蓝色的白牌）造成的伤害和buff施加。对手依旧可以对自己施加正面增益。冰封、诅咒等仍能命中。' },
    { key: 'hypothermia', name: '失温', type: '负面状态', icon: 'icons/buff_icons/hypothermia.png', desc: '堆叠上限：2\n维持效果：衰减\n冻洋蓝鲸出4/5/6时，在防守方完成防御并结算伤害后，对防守方施加1层失温。当失温达到2层时，立即强制弃1张牌（玩家自选，NPC按最低优先级弃牌），随后失温削减1层。' }
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
    }
    return null;
  }

  function colorize(text) {
    if (typeof parseSegments !== 'function') return text;
    const segs = parseSegments(text, '');
    return segs.map(s => s.color ? `<span style="color:${s.color}">${s.text}</span>` : s.text).join('');
  }

  function resolveIcon(icon) {
    if (!icon) return '';
    if (icon.startsWith('http') || icon.startsWith('data:')) return icon;
    if (icon.startsWith('../')) return icon.substring(3);
    return icon;
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

  function buildCategoryPage() {
    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back">&larr; 返回</button><h1 class="rules-title">冒险图鉴</h1></div>';
    html += '<div class="codex-category-grid">';
    html += '<div class="codex-category-card" data-cat="monster"><div class="codex-category-icon">👹</div><div class="codex-category-name">怪物图鉴</div></div>';
    html += '<div class="codex-category-card" data-cat="boss"><div class="codex-category-icon">👑</div><div class="codex-category-name">Boss图鉴</div></div>';
    html += '<div class="codex-category-card" data-cat="consumable"><div class="codex-category-icon">🧪</div><div class="codex-category-name">道具图鉴</div></div>';
    html += '<div class="codex-category-card" data-cat="accessory"><div class="codex-category-icon">💍</div><div class="codex-category-name">饰品图鉴</div></div>';
    html += '<div class="codex-category-card" data-cat="trophyWhite"><div class="codex-category-icon">🃏</div><div class="codex-category-name">战利白卡</div></div>';
    html += '<div class="codex-category-card" data-cat="buff"><div class="codex-category-icon">✨</div><div class="codex-category-name">Buff图鉴</div></div>';
    html += '</div></div>';
    return html;
  }

  function buildMonsterList() {
    const monsters = window.AdventureRegistry ? window.AdventureRegistry.allMonsters() : [];
    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back-cat">&larr; 图鉴分类</button><h1 class="rules-title">怪物图鉴</h1></div>';
    html += '<div class="char-detail-grid">';
    for (const m of monsters) {
      const icon = resolveIcon(m.icon);
      const iconHtml = icon ? `<img class="char-detail-avatar" src="${icon}" onerror="this.style.display='none'" alt="${m.name}">` : `<div class="char-detail-avatar codex-no-icon">${m.name[0]}</div>`;
      html += `<div class="char-detail-card" data-name="${m.name}">${iconHtml}<div class="char-detail-name">${m.name}</div><div class="char-detail-type">${m.kind || '怪物'}</div></div>`;
    }
    html += '</div></div>';
    return html;
  }

  function collectSpecialNotes(entity, name) {
    const fromMd = (window.AdventureMonsterNotes && window.AdventureMonsterNotes[name]) || [];
    const notes = [];
    for (const n of fromMd) {
      if (buffKeyFromEncyclopediaTitle(n.title)) continue;
      const lines = (n.lines || []).slice();
      // Drop lines that are only a buff encyclopedia blurb: "【茂盛】：正面 buff…"
      const kept = lines.filter(line => {
        const m = String(line).match(/^【([^】]+)】[：:]/);
        if (m && BUFF_BY_NAME[m[1]]) return false;
        return true;
      });
      if (kept.length) notes.push({ title: n.title, lines: kept });
      else if (!lines.length) notes.push({ title: n.title, lines: [] });
    }
    const hasTitle = re => notes.some(n => re.test(n.title) || n.lines.some(l => re.test(l)));
    const pushAuto = (title, line) => {
      if (!line) return;
      if (notes.some(n => n.title === title || n.lines.includes(line))) return;
      notes.push({ title, lines: [line] });
    };
    if (entity.firstStrike && !hasTitle(/先攻|先手/)) {
      pushAuto('先手攻击', '战斗开始时对手先行进攻，玩家不补起始手牌');
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
      pushAuto('被动', '可用高牌（4/5/6）防御');
    }
    if (entity.whiteZeros && !hasTitle(/白色\s*0|白0|牌库/)) {
      pushAuto('牌库', '普通 NPC 牌库 + ' + entity.whiteZeros + ' 张白色 0');
    }
    if (entity.handLimit && entity.handLimit < 4 && !hasTitle(/手牌/)) {
      pushAuto('手牌', '手牌上限 ' + entity.handLimit + ' 张');
    }
    return notes;
  }

  function buildSpecialNotes(entity, name) {
    const notes = collectSpecialNotes(entity, name);
    if (!notes.length) return '';
    let html = '<div class="codex-notes-section">';
    html += '<div class="codex-notes-title">特殊说明</div>';
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
    html += '</div>';
    return html;
  }

  function buildMonsterDetail(name) {
    const m = window.AdventureRegistry ? window.AdventureRegistry.getMonster(name) : null;
    if (!m) return '';
    const skills = adventureSkillArrays(name, 1);
    const icon = resolveIcon(m.icon);
    const iconHtml = icon ? `<img class="char-detail-hero-avatar" src="${icon}" onerror="this.style.display='none'" alt="${m.name}">` : `<div class="char-detail-hero-avatar codex-no-icon">${m.name[0]}</div>`;

    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back-list">&larr; 怪物列表</button><h1 class="rules-title">怪物图鉴</h1></div>';
    html += `<div class="char-detail-hero">${iconHtml}<div class="char-detail-hero-info">`;
    html += `<div class="char-detail-hero-name">${m.kind || m.name}</div>`;
    html += `<div class="char-detail-hero-type">${m.kind || '怪物'} · HP ${m.hp}${m.handLimit ? ' · 手牌' + m.handLimit : ''}</div>`;
    html += `</div></div>`;

    html += buildSpecialNotes(m, name);
    html += buildSkillGrid(skills.atk, skills.def, !!m.canDefendHigh, !!m.whiteZeros);
    html += buildStageMods(name);
    html += '</div>';
    return html;
  }

  function buildBossList() {
    const bosses = window.AdventureRegistry ? window.AdventureRegistry.allBosses() : [];
    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back-cat">&larr; 图鉴分类</button><h1 class="rules-title">Boss图鉴</h1></div>';
    if (!bosses.length) {
      html += '<div class="codex-empty">暂无Boss数据</div>';
    } else {
      html += '<div class="char-detail-grid">';
      for (const b of bosses) {
        const icon = resolveIcon(b.icon);
        const iconHtml = icon ? `<img class="char-detail-avatar" src="${icon}" onerror="this.style.display='none'" alt="${b.name}">` : `<div class="char-detail-avatar codex-no-icon">${b.name[0]}</div>`;
        html += `<div class="char-detail-card" data-name="${b.name}">${iconHtml}<div class="char-detail-name">${b.kind || b.name}</div><div class="char-detail-type">HP ${b.hp}</div></div>`;
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function buildBossDetail(name) {
    const b = window.AdventureRegistry ? window.AdventureRegistry.getBoss(name) : null;
    if (!b) return '';
    const skills = adventureSkillArrays(name, 1);
    const icon = resolveIcon(b.icon);
    const iconHtml = icon ? `<img class="char-detail-hero-avatar" src="${icon}" onerror="this.style.display='none'" alt="${b.name}">` : `<div class="char-detail-hero-avatar codex-no-icon">${b.name[0]}</div>`;

    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back-list">&larr; Boss列表</button><h1 class="rules-title">Boss图鉴</h1></div>';
    html += `<div class="char-detail-hero">${iconHtml}<div class="char-detail-hero-info">`;
    html += `<div class="char-detail-hero-name">${b.kind || b.name}</div>`;
    html += `<div class="char-detail-hero-type">Boss · HP ${b.hp}${b.handLimit ? ' · 手牌' + b.handLimit : ''}</div>`;
    html += `</div></div>`;

    html += buildSpecialNotes(b, name);
    if (skills.atk.length || skills.def.length) {
      html += buildSkillGrid(skills.atk, skills.def, !!b.canDefendHigh, !!b.whiteZeros);
    }
    html += buildStageMods(name);
    html += '</div>';
    return html;
  }

  function buildItemList(kind) {
    const allItems = window.AdventureRegistry ? window.AdventureRegistry.allItems() : [];
    const items = allItems.filter(it => it.kind === kind);
    const title = kind === 'consumable' ? '道具图鉴' : '饰品图鉴';
    let html = '<div class="char-detail-page">';
    html += `<div class="rules-header"><button class="rules-back-btn" id="codex-back-cat">&larr; 图鉴分类</button><h1 class="rules-title">${title}</h1></div>`;
    if (!items.length) {
      html += '<div class="codex-empty">暂无数据</div>';
    } else {
      html += '<div class="char-detail-grid">';
      for (const it of items) {
        const icon = resolveIcon(it.icon);
        const iconHtml = icon ? `<img class="char-detail-avatar" src="${icon}" onerror="this.style.display='none'" alt="${it.displayName}">` : `<div class="char-detail-avatar codex-no-icon">${it.displayName[0]}</div>`;
        html += `<div class="char-detail-card" data-name="${it.name}">${iconHtml}<div class="char-detail-name">${it.displayName}</div><div class="char-detail-type">${it.price || 0}金币</div></div>`;
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function buildItemDetail(name) {
    const it = window.AdventureRegistry ? window.AdventureRegistry.getItem(name) : null;
    if (!it) return '';
    const icon = resolveIcon(it.icon);
    const iconHtml = icon ? `<img class="char-detail-hero-avatar" src="${icon}" onerror="this.style.display='none'" alt="${it.displayName}">` : `<div class="char-detail-hero-avatar codex-no-icon">${it.displayName[0]}</div>`;
    const kindLabel = it.kind === 'consumable' ? '一次性道具' : '配饰';
    const useSceneLabel = it.useScene === 'both' ? '地图/战斗均可使用' : it.useScene === 'combat' ? '战斗中使用' : it.useScene === 'map' ? '地图使用' : '';

    let html = '<div class="char-detail-page">';
    html += `<div class="rules-header"><button class="rules-back-btn" id="codex-back-list">&larr; ${kindLabel}列表</button><h1 class="rules-title">${it.kind === 'consumable' ? '道具图鉴' : '饰品图鉴'}</h1></div>`;
    html += `<div class="char-detail-hero">${iconHtml}<div class="char-detail-hero-info">`;
    html += `<div class="char-detail-hero-name">${it.displayName}</div>`;
    html += `<div class="char-detail-hero-type">${kindLabel} · ${it.kind === 'accessory' ? 15 : (it.price || 0)}金币</div>`;
    html += `<div class="char-detail-hero-passive">${it.description || ''}</div>`;
    if (useSceneLabel) html += `<div class="char-detail-hero-passive">${useSceneLabel}</div>`;
    html += `</div></div>`;

    if (it.statBonus) {
      html += '<div class="codex-stat-bonus">';
      html += '<div class="codex-stat-title">属性加成</div>';
      html += '<div class="codex-stat-list">';
      for (const [k, v] of Object.entries(it.statBonus)) {
        const label = k === 'maxHp' ? '生命上限' : k === 'dropRateBonus' ? '掉落概率' : k;
        html += `<div class="codex-stat-row"><span class="codex-stat-key">${label}</span><span class="codex-stat-val">+${v}</span></div>`;
      }
      html += '</div></div>';
    }


    html += '</div>';
    return html;
  }

  function buildTrophyList() {
    const allItems = window.AdventureRegistry ? window.AdventureRegistry.allItems() : [];
    const items = allItems.filter(it => it.kind === 'trophyWhite');
    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back-cat">&larr; 图鉴分类</button><h1 class="rules-title">战利白卡</h1></div>';
    if (!items.length) {
      html += '<div class="codex-empty">暂无数据</div>';
    } else {
      html += '<div class="char-detail-grid">';
      for (const it of items) {
        const icon = resolveIcon(it.icon);
        const iconHtml = icon ? `<img class="char-detail-avatar" src="${icon}" onerror="this.style.display='none'" alt="${it.displayName}">` : `<div class="char-detail-avatar codex-no-icon">${it.displayName[0]}</div>`;
        const shortName = (it.displayName || it.name || '').replace(/战利白卡/g, '').trim();
        html += `<div class="char-detail-card" data-name="${it.name}">${iconHtml}<div class="char-detail-name">${shortName}</div><div class="char-detail-type">${it.price || 0}金币</div></div>`;
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function buildTrophyDetail(name) {
    const it = window.AdventureRegistry ? window.AdventureRegistry.getItem(name) : null;
    if (!it) return '';
    const icon = resolveIcon(it.icon);
    const iconHtml = icon ? `<img class="char-detail-hero-avatar" src="${icon}" onerror="this.style.display='none'" alt="${it.displayName}">` : `<div class="char-detail-hero-avatar codex-no-icon">${it.displayName[0]}</div>`;
    const effectLabel = { burn: '灼伤', bleed: '流血', freeze: '冷冻', bomb: '定时炸弹', roulette: '俄罗斯赌盘', guard: '守护', disarm: '缴械' }[it.trophyEffect] || it.trophyEffect || '';

    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back-list">&larr; 战利白卡</button><h1 class="rules-title">战利白卡</h1></div>';
    html += `<div class="char-detail-hero">${iconHtml}<div class="char-detail-hero-info">`;
    html += `<div class="char-detail-hero-name">${it.displayName}</div>`;
    html += `<div class="char-detail-hero-type">战利白卡 · ${it.price || 0}金币</div>`;
    html += `<div class="char-detail-hero-passive">${it.description || ''}</div>`;
    html += `</div></div>`;
    if (it.beastTradeCost && it.beastTradeCost.length) {
      html += '<div class="codex-stat-bonus"><div class="codex-stat-title">兑换消耗</div><div class="codex-stat-list">';
      const beastNames = { huo: '火兽元', shui: '水兽元', cao: '草兽元', ben: '本兽元', wuneng: '万能兽元' };
      const beastColors = { huo: '#ff5555', shui: '#55aaff', cao: '#55cc55', ben: '#ffcc44', wuneng: '#cc88ff' };
      const costMap = {};
      for (const t of it.beastTradeCost) costMap[t] = (costMap[t] || 0) + 1;
      const parts = [];
      for (const [k, v] of Object.entries(costMap)) {
        const name = beastNames[k] || k;
        const color = beastColors[k] || '#ccc';
        parts.push(`${v}<span style="color:${color}">[${name}]</span>`);
      }
      html += `<div class="codex-stat-row"><span class="codex-stat-key">${parts.join(' ')}</span></div>`;
      html += '</div></div>';
    }
    html += '</div>';
    return html;
  }

  function buildBuffList() {
    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back-cat">&larr; 图鉴分类</button><h1 class="rules-title">Buff图鉴</h1></div>';
    html += '<div class="char-detail-grid">';
    for (const buff of BUFF_DATA) {
      const icon = resolveIcon(buff.icon);
      const iconHtml = icon ? `<img class="char-detail-avatar" src="${icon}" onerror="this.style.display='none'" alt="${buff.name}">` : `<div class="char-detail-avatar codex-no-icon">${buff.name[0]}</div>`;
      html += `<div class="char-detail-card" data-buff="${buff.key}">${iconHtml}<div class="char-detail-name">${buff.name}</div><div class="char-detail-type">${buff.type}</div></div>`;
    }
    html += '</div></div>';
    return html;
  }

  function buildBuffDetail(key) {
    const buff = BUFF_DATA.find(item => item.key === key);
    if (!buff) return '';
    const icon = resolveIcon(buff.icon);
    const iconHtml = icon ? `<img class="char-detail-hero-avatar" src="${icon}" onerror="this.style.display='none'" alt="${buff.name}">` : `<div class="char-detail-hero-avatar codex-no-icon">${buff.name[0]}</div>`;
    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back-list">&larr; Buff列表</button><h1 class="rules-title">Buff图鉴</h1></div>';
    html += `<div class="char-detail-hero">${iconHtml}<div class="char-detail-hero-info">`;
    html += `<div class="char-detail-hero-name">${buff.name}</div>`;
    html += `<div class="char-detail-hero-type">${buff.type}</div>`;
    const descLines = String(buff.desc || '').split('\n').filter(Boolean);
    html += `<div class="char-detail-hero-passive">${descLines.map(line => formatCodexRichText(line)).join('<br>')}</div>`;
    html += '</div></div></div>';
    return html;
  }

  function buildSkillGrid(atk, def, canDefendHigh = false, includeZero = false) {
    if (!atk.length && !def.length) return '';
    let html = '<div class="skill-grid">';
    for (const row of npcSkillGrid(includeZero)) {
      const atkDesc = atk[row.atkKey] ? formatCodexSkillText(atk[row.atkKey]) : '—';
      const highDefKey = canDefendHigh && ['4', '5', '6'].includes(row.label) ? row.atkKey : -1;
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
        if (cat === 'monster') showMonsterList(container);
        else if (cat === 'boss') showBossList(container);
        else if (cat === 'consumable') showItemList(container, 'consumable');
        else if (cat === 'accessory') showItemList(container, 'accessory');
        else if (cat === 'trophyWhite') showTrophyList(container);
        else if (cat === 'buff') showBuffList(container);
      });
    });
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
    container.querySelectorAll('.char-detail-card').forEach(el => {
      el.addEventListener('click', () => showItemDetail(container, el.dataset.name, kind));
    });
  }

  function showItemDetail(container, name, kind) {
    container.innerHTML = buildItemDetail(name);
    document.getElementById('codex-back-list').addEventListener('click', () => showItemList(container, kind));
  }

  function showTrophyList(container) {
    container.innerHTML = buildTrophyList();
    document.getElementById('codex-back-cat').addEventListener('click', () => showCategoryPage(container));
    container.querySelectorAll('.char-detail-card').forEach(el => {
      el.addEventListener('click', () => showTrophyDetail(container, el.dataset.name));
    });
  }

  function showTrophyDetail(container, name) {
    container.innerHTML = buildTrophyDetail(name);
    document.getElementById('codex-back-list').addEventListener('click', () => showTrophyList(container));
  }

  function showBuffList(container) {
    container.innerHTML = buildBuffList();
    document.getElementById('codex-back-cat').addEventListener('click', () => showCategoryPage(container));
    container.querySelectorAll('.char-detail-card').forEach(el => {
      el.addEventListener('click', () => showBuffDetail(container, el.dataset.buff));
    });
  }

  function showBuffDetail(container, key) {
    container.innerHTML = buildBuffDetail(key);
    document.getElementById('codex-back-list').addEventListener('click', () => showBuffList(container));
  }

  window.AdventureCodex = { show: showCategoryPage };
})();
