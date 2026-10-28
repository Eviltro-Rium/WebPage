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
          desc: '道具牌，搭桥使用。打出后立即净化1层buff（灼伤/流血/中毒/冷冻等负面，或守护/飞翔/暴击等正面，玩家自选），然后继续搭桥。',
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
    { title: '弃牌库', desc: '打出的牌会进入弃牌库，弃牌库顶决定下一张牌的匹配条件。单机对战共用牌堆与弃牌库；冒险中玩家与怪物各自回收自己的牌，不会混洗。' }
  ];

  const DECK_COMPARISON = [
    ['初始牌组总数', '101 张，所有参战角色共用', '93 张，独立于怪物牌组'],
    ['四色数字牌 0~7', '68 张', '68 张，与单机配置相同'],
    ['白色数字牌', '白 1~7 各 1 张，共 7 张', '白 1~7 各 1 张，共 7 张'],
    ['普通黑牌 / 黑色 +2', '各 2 张', '各 2 张'],
    ['黑色洗入', '4 张', '2 张'],
    ['白色药水 / 白色 +3', '药水 4 张；+3 共 2 张', '药水 4 张；+3 共 2 张'],
    ['白色净化', '6 张', '4 张'],
    ['白色超级净化', '4 张', '2 张'],
    ['白色交换手牌', '2 张', '无，避免玩家与怪物牌库混淆'],
    ['战利白卡', '无', '初始不含；冒险获得后加入手牌，进入玩家牌组循环，不占一次性道具槽。打出后搭桥并抽 1 张牌'],
    ['牌库与弃牌库归属', '所有角色共用一套牌库与弃牌库', '只从玩家牌库抽牌，只回收玩家弃牌'],
    ['洗牌补充', '牌库耗尽时，保留弃牌库顶，将其余弃牌洗回牌库', '按玩家牌库规则回收玩家弃牌，不混入怪物牌'],
    ['进入 / 结束房间', '每局重新初始化牌组', '进入战斗房间后翻开新牌初始化弃牌库顶；战斗结束保留手牌、牌库、弃牌库']
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
      html += `<div class="rule-item"><div class="rule-item-title">${rule.title}</div><div class="rule-item-desc">${window.descToEmoji ? window.descToEmoji(rule.desc) : rule.desc}</div></div>`;
    }
    html += '</div></div>';

    html += '<section class="rules-section"><h2 class="rules-section-title">单机对战与冒险牌库对比</h2>';
    html += '<p class="rules-table-note">牌组总数包含手牌、待抽牌和弃牌；弃牌库顶属于弃牌库，不额外占一张。冒险中的战利白卡会改变玩家牌组总数。</p>';
    html += '<div class="rules-table-wrap" role="region" aria-label="两种模式牌库对照表" tabindex="0"><table class="rules-deck-table">';
    html += '<caption>玩家牌组配置与循环规则</caption><thead><tr><th scope="col">对比项目</th><th scope="col">单机对战</th><th scope="col">冒险 · 玩家</th></tr></thead><tbody>';
    for (const [label, classic, player] of DECK_COMPARISON) {
      html += '<tr><th scope="row">' + label + '</th><td>' + classic + '</td><td>' + player + '</td></tr>';
    }
    html += '</tbody></table></div><p class="rules-table-note">窄屏可在表格内左右滑动。以下卡牌示例展示通用效果，数量以对应模式的配置为准；战利白卡与怪物技能详见冒险图鉴。</p></section>';

    let thumbSlots = [];
    const npcCard = card => Object.assign(card, { npcCard: true });
    const npcRows = [
      ['白 1 / 2 / 3', '各 4 张', '触发怪物对应的进攻、防御技能。', [1,2,3].map(v => npcCard(num('WHITE',v,true)))],
      ['白 4 / 5 / 6', '各 2 张', '一般用于进攻；特殊怪物可用高点数牌防御，以怪物技能为准。', [4,5,6].map(v => npcCard(num('WHITE',v,true)))],
      ['白 7', '2 张', '轮空牌，没有进攻或防御效果。', [npcCard(num('WHITE',7,true))]],
      ['白 0', '1 张', '普通怪物打出后没有攻防效果；Boss 触发对应的 0 技能。', [npcCard(num('WHITE',0,true))]],
      ['紫魔法', '1 张', '恢复 3 点生命（Boss 为 5 点），清除对手可清除的正面状态。', [npcCard(item('WHITE','magic'))]],
      ['绿魔法', '1 张', '恢复 3 点生命（Boss 为 5 点），清除自身可清除的负面状态。', [npcCard(item('WHITE','greenMagic'))]]
    ];
    html += '<section class="rules-section"><h2 class="rules-section-title">冒险怪物卡牌</h2><p class="rules-table-note">怪物牌组共 23 张，普通怪物与 Boss 使用相同的牌组构成。怪物牌面带紫色角标与骷髅标识。挑战房两个怪物共享怪物牌库与弃牌库，与玩家牌库完全隔离。</p>';
    html += '<div class="rules-table-wrap" role="region" aria-label="怪物卡牌介绍" tabindex="0"><table class="rules-deck-table rules-npc-table"><thead><tr><th scope="col">卡牌</th><th scope="col">数量</th><th scope="col">效果</th></tr></thead><tbody>';
    for (const [label, count, effect, samples] of npcRows) {
      let thumbs = '<div class="rule-card-row">';
      for (const card of samples) {
        const id = thumbPlaceholder();
        thumbs += '<span id="' + id + '"></span>';
        thumbSlots.push({ id, card });
      }
      html += '<tr><th scope="row">' + label + thumbs + '</div></th><td>' + count + '</td><td>' + effect + '</td></tr>';
    }
    html += '</tbody></table></div><p class="rules-table-note">怪物牌库少于3张时回收怪物弃牌；战斗结束后全部怪物手牌与弃牌回收。挑战房一个怪物倒下时，其手牌进入怪物弃牌库，不改变当前弃牌库顶。</p></section>';
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
        html += `<div class="rule-item">${thumbs}<div class="rule-item-title">${card.name}</div><div class="rule-item-desc">${window.descToEmoji ? window.descToEmoji(card.desc) : card.desc}</div><div class="rule-item-count">单机对战数量：${card.count}</div></div>`;
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
