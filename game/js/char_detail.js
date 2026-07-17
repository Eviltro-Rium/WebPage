(function () {
  const CHARS = [
    { name: 'Ryan', hp: 70, type: '战士', passive: '进攻回合开始前恢复1点生命', avatar: 'avatars/Ryan.jpg', color: '#14eb5f' },
    { name: 'Leon', hp: 90, type: '火法', passive: '免疫灼烧伤害', avatar: 'avatars/Leon.png', color: '#ee1111' },
    { name: 'Chan', hp: 80, type: '谋士', passive: '进攻回合开始前抽1张牌', avatar: 'avatars/Chan.png', color: '#1399f2' },
    { name: 'Saiki', hp: 80, type: '猎手', passive: '有效黄色牌施加1层流血', avatar: 'avatars/Saiki.png', color: '#9b59b6' },
    { name: 'Blaze', hp: 85, type: '狂战', passive: '有灼烧时1至7牌攻击伤害+1', avatar: 'avatars/Blaze.png', color: '#e67e22' },
    { name: 'Serenity', hp: 80, type: '暗影', passive: '免疫冷冻；低于30生命嗜血，正常态恢复+1', avatar: 'avatars/Serenity.jpg', color: '#1abc9c' },
    { name: 'Moze', hp: 100, type: '守护', passive: '守护可减免非流血伤害', avatar: 'avatars/Moze.jpg', color: '#7f8c8d' },
    { name: 'Knight', hp: 80, type: '混沌', passive: '进攻前清除混沌；打出基础颜色数字牌获得对应混沌', avatar: 'avatars/Knight.png', color: '#8e44ad' }
  ];

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

  function buildCharList() {
    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="char-back">&larr; 返回</button><h1 class="rules-title">角色详情</h1></div>';
    html += '<div class="char-detail-grid">';
    for (const ch of CHARS) {
      html += `<div class="char-detail-card" data-name="${ch.name}">
        <img class="char-detail-avatar" src="${ch.avatar}" onerror="this.src=this.src.replace('.png','.jpg')" alt="${ch.name}">
        <div class="char-detail-name" style="color:${ch.color}">${ch.name}</div>
        <div class="char-detail-type">${ch.type}</div>
      </div>`;
    }
    html += '</div></div>';
    return html;
  }

  function colorize(text) {
    if (typeof parseSegments !== 'function') return text;
    const segs = parseSegments(text, '');
    return segs.map(s => s.color ? `<span style="color:${s.color}">${s.text}</span>` : s.text).join('');
  }

  function buildCharDetail(name) {
    const ch = CHARS.find(c => c.name === name);
    if (!ch) return '';
    const atk = (SKILL_DATA && SKILL_DATA.attack && SKILL_DATA.attack[name]) || [];
    const def = (SKILL_DATA && SKILL_DATA.defend && SKILL_DATA.defend[name]) || [];

    let html = '<div class="char-detail-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="char-back-list">&larr; 角色列表</button><h1 class="rules-title">角色详情</h1></div>';

    html += `<div class="char-detail-hero">
      <img class="char-detail-hero-avatar" src="${ch.avatar}" onerror="this.src=this.src.replace('.png','.jpg')" alt="${ch.name}">
      <div class="char-detail-hero-info">
        <div class="char-detail-hero-name" style="color:${ch.color}">${ch.name}</div>
        <div class="char-detail-hero-type">${ch.type} · HP ${ch.hp}</div>
        <div class="char-detail-hero-passive">被动：${ch.passive}</div>
      </div>
    </div>`;

    html += '<div class="skill-grid">';
    for (const row of SKILL_GRID) {
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
    html += '</div></div>';
    return html;
  }

  function showCharList(container) {
    container.innerHTML = buildCharList();
    container.classList.add('active');
    document.getElementById('select-screen').classList.remove('active');

    document.getElementById('char-back').addEventListener('click', () => {
      container.classList.remove('active');
      document.getElementById('select-screen').classList.add('active');
    });

    container.querySelectorAll('.char-detail-card').forEach(el => {
      el.addEventListener('click', () => {
        const name = el.dataset.name;
        showCharDetail(container, name);
      });
    });
  }

  function showCharDetail(container, name) {
    container.innerHTML = buildCharDetail(name);

    document.getElementById('char-back-list').addEventListener('click', () => {
      showCharList(container);
    });
  }

  window.CharDetailPage = { show: showCharList };
})();