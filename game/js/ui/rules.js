(function () {
  const Card = window.FurryGame && window.FurryGame.Card;
  const num = (color, value, white = false) => Card
    ? Card.number(color, value, white)
    : { value, color, drawTwo: false, drawThree: false, potion: false, purify: false, superPurify: false, swapHand: false, shuffleToDeck: false, isBlack: false, isWhite: white, isNumberCard: true, isItemCard: false };
  const item = (color, k) => Card
    ? Card.item(color, k)
    : { value: -1, color, drawTwo: k === 'drawTwo', drawThree: k === 'drawThree', potion: k === 'potion', purify: k === 'purify', superPurify: k === 'superPurify', swapHand: k === 'swap', shuffleToDeck: k === 'shuffle', isBlack: color === 'BLACK', isWhite: color === 'WHITE', isNumberCard: false, isItemCard: true };

  const CARD_DATA = [
    {
      category: '数字牌',
      color: '#86efac',
      cards: [
        {
          name: '四色数字牌 0~3',
          desc: '可进攻，也可防御；触发角色对应的数字技能。',
          samples: [num('RED', 0), num('YELLOW', 1), num('BLUE', 3)]
        },
        {
          name: '四色数字牌 4~7',
          desc: '仅用于进攻，触发角色对应的数字技能。',
          samples: [num('RED', 4), num('YELLOW', 6), num('BLUE', 7)]
        }
      ]
    },
    {
      category: '白色牌',
      color: '#e8e8ed',
      cards: [
        {
          name: '白 1~7',
          desc: '匹配任意牌，自动继承当前颜色。1~3可攻可守，4~7仅能进攻。',
          samples: [num('WHITE', 2, true), num('WHITE', 5, true), num('WHITE', 7, true)]
        },
        {
          name: '白色药水',
          desc: '恢复5点生命。',
          samples: [item('WHITE', 'potion')]
        },
        {
          name: '白色净化',
          desc: '选择移除自身1层可净化状态，可选正面或负面状态。',
          samples: [item('WHITE', 'purify')]
        },
        {
          name: '白色超级净化',
          desc: '选择自己或一名对手，移除其全部可净化状态。',
          samples: [item('WHITE', 'superPurify')]
        },
        {
          name: '白色+3',
          desc: '抽3张牌。',
          samples: [item('WHITE', 'drawThree')]
        },
        {
          name: '白色交换',
          desc: '与一名对手交换手牌。冒险模式的初始牌组不含此牌。',
          samples: [item('WHITE', 'swap')]
        }
      ]
    },
    {
      category: '黑色牌',
      color: '#3a3545',
      cards: [
        {
          name: '黑色（调色盘）',
          desc: '指定红、黄、蓝、绿中的一种颜色。',
          samples: [item('BLACK', 'black')]
        },
        {
          name: '黑色+2',
          desc: '指定颜色，并抽2张牌。',
          samples: [item('BLACK', 'drawTwo')]
        },
        {
          name: '黑色洗入',
          desc: '指定颜色，将弃牌库洗回牌堆。',
          samples: [item('BLACK', 'shuffle')]
        }
      ]
    }
  ];

  const GAMEPLAY_RULES = [
    { title: '怎样出牌', desc: '数字牌需与弃牌库顶同色或同点数；白牌自动继承当前颜色，黑牌由你指定颜色。道具牌不受颜色、点数限制。' },
    { title: '怎样防御', desc: '防御时可出0~3点数字牌或道具牌。数字牌触发防御技能并结算本次攻击；也可跳过防御。角色与怪物的特殊规则以技能说明为准。' },
    { title: '什么是搭桥', desc: '在进攻或防御出牌阶段打出道具牌，先执行效果，再继续选牌。搭桥本身不会结束本次进攻或防御。' },
    { title: '何时结束回合', desc: '一次进攻结算后可以继续出牌，或点击“结束回合”。补牌后换对手进攻；击败所有对手获胜。' }
  ];

  const DECK_COMPARISON = [
    ['初始牌组', '101张 · 全体共用', '95张 · 玩家独立牌组'],
    ['四色数字牌 / 白色数字牌', '68张 / 7张', '68张 / 7张'],
    ['黑色指定颜色 / ＋2 / 洗入', '4张 / 2张 / 2张', '4张 / 2张 / 2张'],
    ['药水 / 白色＋3', '4张 / 2张', '4张 / 2张'],
    ['净化 / 超级净化', '6张 / 4张', '4张 / 2张'],
    ['交换手牌', '2张', '不含'],
    ['战利白卡', '不含', '冒险中获得，加入玩家牌组循环']
  ];

  let _thumbId = 0;
  function thumbPlaceholder() {
    return `rule-thumb-${++_thumbId}`;
  }

  function buildRulesPage() {
    const container = document.getElementById('rules-screen');
    if (!container) return;

    let html = '<div class="rules-page">';
    html += '<div class="rules-header"><button class="rules-back-btn" id="rules-back">&larr; 返回</button><h1 class="rules-title">规则介绍</h1></div>';

    html += '<p class="rules-lead">先掌握出牌与防御；角色技能可在战斗中点击技能书查看。</p>';
    html += '<section class="rules-section" aria-label="核心规则"><div class="rules-quick-grid">';
    for (const rule of GAMEPLAY_RULES) {
      html += `<div class="rule-item"><h2 class="rule-item-title">${rule.title}</h2><p class="rule-item-desc">${rule.desc}</p></div>`;
    }
    html += '</div><p class="rules-turn-flow">出牌进攻 <span>→</span> 对手防御 <span>→</span> 结算 <span>→</span> 继续出牌或结束回合</p></section>';
    html += '<details class="rules-disclosure"><summary><span>卡牌效果速查</span><small>数字牌 · 白牌 · 黑牌</small></summary><div class="rules-disclosure-body">';
    html += '<p class="rules-table-note">以下只列卡牌效果。道具牌执行后继续搭桥；数字牌触发角色技能。具体技能见战斗技能书。</p>';

    let thumbSlots = [];
    for (const cat of CARD_DATA) {
      html += `<section class="rules-section"><h3 class="rules-section-title" style="border-left:4px solid ${cat.color}">${cat.category}</h3><div class="rules-reference-grid">`;
      for (const card of cat.cards) {
        let thumbs = '';
        if (card.samples && card.samples.length) {
          thumbs = '<div class="rule-card-row">';
          for (const s of card.samples) {
            const pid = thumbPlaceholder();
            thumbs += `<span id="${pid}"></span>`;
            thumbSlots.push({ id: pid, card: s });
          }
          thumbs += '</div>';
        }
        html += `<div class="rule-item">${thumbs}<div class="rule-item-title">${card.name}</div><div class="rule-item-desc">${window.descToEmoji ? window.descToEmoji(card.desc) : card.desc}</div></div>`;
      }
      html += '</div></section>';
    }

    html += '</div></details>';
    html += '<details class="rules-disclosure"><summary><span>冒险模式补充</span><small>独立牌库 · 战利白卡 · 怪物牌</small></summary><div class="rules-disclosure-body">';
    html += '<ul class="rules-adventure-notes"><li>玩家与怪物各用各的牌库、弃牌库；挑战房的两名怪物共享一套怪物牌组。</li><li>进入战斗时翻开新牌作为弃牌库顶；结束房间后保留玩家手牌和牌库。</li><li>战利白卡加入手牌，不占道具槽；打出后进入弃牌库，可循环抽到。抽牌数量、能否继续搭桥以卡片说明为准。</li></ul>';
    const npcCard = card => Object.assign(card, { npcCard: true });
    const npcRows = [
      ['白 1 / 2 / 3', '各 4 张', '按怪物技能触发进攻或防御效果。', [1,2,3].map(v => npcCard(num('WHITE',v,true)))],
      ['白 4 / 5 / 6', '各 2 张', '用于进攻；部分怪物可用高点数牌防御，详见技能。', [4,5,6].map(v => npcCard(num('WHITE',v,true)))],
      ['白 7', '2 张', '普通怪物和场景Boss无效果；堕落Ryan例外，详见图鉴。', [npcCard(num('WHITE',7,true))]],
      ['白 0', '1 张', '普通怪物打出后没有攻防效果；Boss 触发对应的 0 技能。', [npcCard(num('WHITE',0,true))]],
      ['紫魔法', '1 张', '回复3点生命，清除对手可清除的正面状态。', [npcCard(item('WHITE','magic'))]],
      ['绿魔法', '1 张', '回复3点生命，清除自身可清除的负面状态。', [npcCard(item('WHITE','greenMagic'))]]
    ];
    html += '<h3 class="rules-section-title">怪物牌组 · 共23张</h3><p class="rules-table-note">普通怪物与Boss使用相同的牌组构成，牌面带紫色标识。Boss魔法回复5点生命。</p><div class="rules-npc-reference">';
    for (const [label, count, effect, samples] of npcRows) {
      const id = thumbPlaceholder();
      thumbSlots.push({ id, card: samples[0] });
      html += '<div class="rule-item rules-npc-row"><span id="' + id + '"></span><div><h4 class="rule-item-title">' + label + ' <small>' + count + '</small></h4><p class="rule-item-desc">' + effect + '</p></div></div>';
    }
    html += '</div><p class="rules-table-note">怪物牌库少于3张时回收其弃牌。挑战房怪物出局后，手牌进入怪物弃牌库。</p></div></details>';
    html += '<details class="rules-disclosure"><summary><span>牌组数量与回收</span><small>单机101张 · 冒险玩家95张</small></summary><div class="rules-disclosure-body">';
    html += '<div class="rules-table-wrap" role="region" aria-label="两种模式牌库对照表" tabindex="0"><table class="rules-deck-table"><thead><tr><th scope="col">卡牌</th><th scope="col">单机对战</th><th scope="col">冒险玩家</th></tr></thead><tbody>';
    for (const [label, classic, player] of DECK_COMPARISON) {
      html += '<tr><th scope="row">' + label + '</th><td>' + classic + '</td><td>' + player + '</td></tr>';
    }
    html += '</tbody></table></div><p class="rules-table-note">牌组总数包含手牌、待抽牌和弃牌，弃牌库顶只计算一次。牌库不足时回收各自弃牌；单机回收时保留当前弃牌库顶。</p></div></details></div>';
    container.innerHTML = html;

    if (typeof renderCard === 'function') {
      for (const slot of thumbSlots) {
        const span = document.getElementById(slot.id);
        if (!span) continue;
        const cv = renderCard(slot.card, 52, 74, false);
        cv.classList.add('rule-card-thumb');
        span.replaceWith(cv);
      }
    }

    document.getElementById('rules-back').addEventListener('click', () => {
      container.classList.remove('active');
      document.getElementById('select-screen').classList.add('active');
    });
  }

  window.RulesPage = { build: buildRulesPage };
})();
