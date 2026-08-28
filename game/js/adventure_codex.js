/**
 * 冒险图鉴 —— 仿照 char_detail.js 的结构，展示怪物/Boss/道具/饰品图鉴。
 */
(function () {
  const SKILL_GRID = [
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

  function buildCategoryPage() {
    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back">&larr; 返回</button><h1 class="rules-title">冒险图鉴</h1></div>';
    html += '<div class="codex-category-grid">';
    html += '<div class="codex-category-card" data-cat="monster"><div class="codex-category-icon">👹</div><div class="codex-category-name">怪物图鉴</div></div>';
    html += '<div class="codex-category-card" data-cat="boss"><div class="codex-category-icon">👑</div><div class="codex-category-name">Boss图鉴</div></div>';
    html += '<div class="codex-category-card" data-cat="consumable"><div class="codex-category-icon">🧪</div><div class="codex-category-name">道具图鉴</div></div>';
    html += '<div class="codex-category-card" data-cat="accessory"><div class="codex-category-icon">💍</div><div class="codex-category-name">饰品图鉴</div></div>';
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

  function buildMonsterDetail(name) {
    const m = window.AdventureRegistry ? window.AdventureRegistry.getMonster(name) : null;
    if (!m) return '';
    const atk = (window.SKILL_DATA && SKILL_DATA.attack && SKILL_DATA.attack[name]) || [];
    const def = (window.SKILL_DATA && SKILL_DATA.defend && SKILL_DATA.defend[name]) || [];
    const icon = resolveIcon(m.icon);
    const iconHtml = icon ? `<img class="char-detail-hero-avatar" src="${icon}" onerror="this.style.display='none'" alt="${m.name}">` : `<div class="char-detail-hero-avatar codex-no-icon">${m.name[0]}</div>`;

    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back-list">&larr; 怪物列表</button><h1 class="rules-title">怪物图鉴</h1></div>';
    html += `<div class="char-detail-hero">${iconHtml}<div class="char-detail-hero-info">`;
    html += `<div class="char-detail-hero-name">${m.name}</div>`;
    html += `<div class="char-detail-hero-type">${m.kind || '怪物'} · HP ${m.hp}${m.handLimit ? ' · 手牌' + m.handLimit : ''}</div>`;
    if (m.firstStrike) html += `<div class="char-detail-hero-passive">先手攻击</div>`;
    if (m.initialLush) html += `<div class="char-detail-hero-passive">开局获得${m.initialLush}层【茂盛】</div>`;
    if (m.noAttack) html += `<div class="char-detail-hero-passive">无进攻阶段</div>`;
    html += `</div></div>`;

    html += buildSkillGrid(atk, def);
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
    const atk = (window.SKILL_DATA && SKILL_DATA.attack && SKILL_DATA.attack[name]) || [];
    const def = (window.SKILL_DATA && SKILL_DATA.defend && SKILL_DATA.defend[name]) || [];
    const icon = resolveIcon(b.icon);
    const iconHtml = icon ? `<img class="char-detail-hero-avatar" src="${icon}" onerror="this.style.display='none'" alt="${b.name}">` : `<div class="char-detail-hero-avatar codex-no-icon">${b.name[0]}</div>`;

    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="codex-back-list">&larr; Boss列表</button><h1 class="rules-title">Boss图鉴</h1></div>';
    html += `<div class="char-detail-hero">${iconHtml}<div class="char-detail-hero-info">`;
    html += `<div class="char-detail-hero-name">${b.kind || b.name}</div>`;
    html += `<div class="char-detail-hero-type">Boss · HP ${b.hp}${b.handLimit ? ' · 手牌' + b.handLimit : ''}</div>`;
    if (b.whiteZeros) html += `<div class="char-detail-hero-passive">牌库含 ${b.whiteZeros} 张白色0</div>`;
    if (b.firstStrike) html += `<div class="char-detail-hero-passive">先手攻击</div>`;
    html += `</div></div>`;

    if (atk.length || def.length) {
      html += buildSkillGrid(atk, def);
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
    html += `<div class="char-detail-hero-type">${kindLabel} · ${it.price || 0}金币</div>`;
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

    if (it.combatUse) {
      html += '<div class="codex-stat-bonus">';
      html += '<div class="codex-stat-title">战斗效果</div>';
      html += `<div class="codex-stat-list"><div class="codex-stat-row"><span class="codex-stat-key">${it.combatUse}</span></div></div>`;
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function buildSkillGrid(atk, def) {
    if (!atk.length && !def.length) return '';
    let html = '<div class="skill-grid">';
    for (const row of SKILL_GRID) {
      const atkDesc = atk[row.atkKey] ? colorize(stripPrefix(atk[row.atkKey])) : '—';
      const defDesc = row.defKey >= 0 && def[row.defKey] ? colorize(stripPrefix(def[row.defKey])) : (row.defKey >= 0 ? '无防御效果' : '');
      html += '<div class="skill-row">';
      html += `<div class="skill-cell skill-atk">${atkDesc}</div>`;
      html += `<div class="skill-num">${row.label}</div>`;
      if (row.defKey >= 0) {
        html += `<div class="skill-cell skill-def">${defDesc}</div>`;
      } else {
        html += '<div class="skill-cell skill-def skill-no-def"></div>';
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function buildStageMods(name) {
    const mods = window.SKILL_DATA && SKILL_DATA.castleStageMods && SKILL_DATA.castleStageMods[name];
    if (!mods) return '';
    let html = '<div class="codex-stage-section">';
    html += '<div class="codex-stage-title">Stage 强化</div>';
    for (const stage of [2, 3, 4]) {
      const mod = mods[stage];
      if (!mod) continue;
      html += `<div class="codex-stage-row"><span class="codex-stage-label">Stage ${stage}</span>`;
      if (mod.attack) {
        html += '<div class="codex-stage-skills"><span class="codex-stage-skill-type">进攻</span>';
        for (const row of SKILL_GRID) {
          if (mod.attack[row.atkKey]) {
            html += `<div class="codex-stage-skill">${row.label}牌：${colorize(stripPrefix(mod.attack[row.atkKey]))}</div>`;
          }
        }
        html += '</div>';
      }
      if (mod.defend) {
        html += '<div class="codex-stage-skills"><span class="codex-stage-skill-type">防御</span>';
        for (let i = 0; i < (mod.defend.length || 0); i++) {
          const labels = ['1牌', '2牌', '3牌', '0牌'];
          html += `<div class="codex-stage-skill">${labels[i] || ''}：${colorize(stripPrefix(mod.defend[i]))}</div>`;
        }
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
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

  window.AdventureCodex = { show: showCategoryPage };
})();
