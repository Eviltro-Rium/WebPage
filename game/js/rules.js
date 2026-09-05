(function () {
  const num = (color, value, white = false) => ({ value, color, drawTwo: false, drawThree: false, potion: false, purify: false, superPurify: false, swapHand: false, shuffleToDeck: false, isBlack: false, isWhite: white, isNumberCard: true, isItemCard: false });
  const item = (color, k) => ({ value: -1, color, drawTwo: k === 'drawTwo', drawThree: k === 'drawThree', potion: k === 'potion', purify: k === 'purify', superPurify: k === 'superPurify', swapHand: k === 'swap', shuffleToDeck: k === 'shuffle', isBlack: color === 'BLACK', isWhite: color === 'WHITE', isNumberCard: false, isItemCard: true });

  const CARD_DATA = [
    {
      category: '数字牌',
      color: '#86efac',
      cards: [
        {
          name: '红/黄/蓝/绿 1~3',
          desc: '基础进攻与防御牌。1~3点数字牌可用于防御（搭桥），也可用于进攻触发角色技能。出牌时需匹配弃牌库顶的颜色或数字。',
          count: '每种颜色各3张，4色共36张',
          samples: [num('RED', 1), num('YELLOW', 2), num('BLUE', 3), num('GREEN', 1)]
        },
        {
          name: '红/黄/蓝/绿 4~6',
          desc: '中高数字牌，只能用于进攻。出牌时需匹配弃牌库顶的颜色或数字，触发角色对应数字的技能效果。',
          count: '每种颜色各2张，4色共24张',
          samples: [num('RED', 4), num('YELLOW', 5), num('BLUE', 6)]
        },
        {
          name: '红/黄/蓝/绿 7',
          desc: '最高数字牌，只能用于进攻。出牌时需匹配弃牌库顶的颜色或数字，触发角色7牌技能。',
          count: '每种颜色各1张，4色共4张',
          samples: [num('RED', 7), num('GREEN', 7)]
        },
        {
          name: '红/黄/蓝/绿 0',
          desc: '特殊数字牌，可用于进攻或防御。0牌通常拥有强力技能效果，出牌时需匹配弃牌库顶的颜色或数字。',
          count: '每种颜色各1张，4色共4张',
          samples: [num('RED', 0), num('BLUE', 0)]
        }
      ]
    },
    {
      category: '白色牌',
      color: '#e8e8ed',
      cards: [
        {
          name: '白 1~7',
          desc: '白色数字牌，可指定为弃牌库顶的有效颜色后出牌。1~3可用于防御（搭桥），其余只能进攻。白色数字牌出牌时自动继承弃牌库顶的有效颜色，无需手动选色。',
          count: '各1张，共7张',
          samples: [num('WHITE', 2, true), num('WHITE', 5, true), num('WHITE', 7, true)]
        },
        {
          name: '白色药水',
          desc: '道具牌，搭桥使用。打出后立即恢复5点生命，然后继续选择下一张牌搭桥或防御。',
          count: '4张',
          samples: [item('WHITE', 'potion')]
        },
        {
          name: '白色净化',
          desc: '道具牌，搭桥使用。打出后立即净化1层debuff（灼烧/流血/中毒/冷冻），然后继续搭桥。玩家使用时可选择净化哪种debuff。',
          count: '6张',
          samples: [item('WHITE', 'purify')]
        },
        {
          name: '白色超级净化',
          desc: '道具牌，搭桥使用。打出后选择一名角色（自己或对手），清除其全部buff与debuff（含守护），然后继续搭桥。',
          count: '4张',
          samples: [item('WHITE', 'superPurify')]
        },
        {
          name: '白色+3',
          desc: '道具牌，搭桥使用。打出后立即抽3张牌，然后继续搭桥。',
          count: '2张',
          samples: [item('WHITE', 'drawThree')]
        },
        {
          name: '白色交换',
          desc: '道具牌，搭桥使用。打出后立即交换双方手牌，然后使用交换后的手牌继续搭桥。',
          count: '2张',
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
          desc: '道具牌，搭桥使用。打出时需手动指定一种颜色（红/黄/蓝/绿），然后继续搭桥。可匹配任何颜色，是最灵活的搭桥牌。',
          count: '2张',
          samples: [item('BLACK', 'black')]
        },
        {
          name: '黑色+2',
          desc: '道具牌，搭桥使用。打出时需手动指定一种颜色，然后继续搭桥。与普通黑牌功能相同，需选色后搭桥。',
          count: '2张',
          samples: [item('BLACK', 'drawTwo')]
        },
        {
          name: '黑色洗入',
          desc: '道具牌，搭桥使用。打出时需手动指定一种颜色，然后将弃牌库洗回牌堆，继续搭桥。当牌库即将耗尽时尤为有用。',
          count: '4张',
          samples: [item('BLACK', 'shuffle')]
        }
      ]
    }
  ];

  const GAMEPLAY_RULES = [
    { title: '出牌规则', desc: '打出的牌必须匹配弃牌库顶的颜色或数字。白色牌可匹配任意颜色（自动继承有效颜色），黑色牌可指定任意颜色后匹配。道具牌不受颜色限制，随时可出。' },
    { title: '搭桥机制', desc: '打出道具牌或1~3点数字牌时，如果是在防御阶段，该牌只发挥道具效果/搭桥作用，然后继续选择下一张牌防御，直到打出4~7或0点数字牌触发防御技能。' },
    { title: '进攻与防御', desc: '进攻方出牌后，防御方可以选择手牌进行防御。防御牌只能是1~3点数字牌或道具牌。防御成功可减免伤害或触发防御技能。也可以选择跳过防御，承受全部伤害。' },
    { title: '回合流程', desc: '玩家回合：出牌进攻 → AI防御 → 结算伤害 → 回合结束补牌。AI回合：AI出牌进攻 → 玩家防御 → 结算伤害 → 回合结束补牌。' },
    { title: '弃牌库', desc: '打出的牌会进入弃牌库。弃牌库顶的牌决定了下一张牌的匹配条件。当牌库耗尽时，弃牌库会被洗回牌堆继续使用。' }
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

    html += '<div class="rules-section"><h2 class="rules-section-title">基本规则</h2><div class="rules-list">';
    for (const rule of GAMEPLAY_RULES) {
      html += `<div class="rule-item"><div class="rule-item-title">${rule.title}</div><div class="rule-item-desc">${rule.desc}</div></div>`;
    }
    html += '</div></div>';

    let thumbSlots = [];
    for (const cat of CARD_DATA) {
      html += `<div class="rules-section"><h2 class="rules-section-title" style="border-left:4px solid ${cat.color}">${cat.category}</h2><div class="rules-list">`;
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
        html += `<div class="rule-item">${thumbs}<div class="rule-item-title">${card.name}</div><div class="rule-item-desc">${card.desc}</div><div class="rule-item-count">牌库数量：${card.count}</div></div>`;
      }
      html += '</div></div>';
    }

    html += '</div>';
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
