# Furry Trial 在线对决（小规模 MVP）

这个目录是静态网页的联机入口。牌面、角色技能、Buff、牌库和事件仍由
game/js/combat/ 的单机代码提供，online_match.js 只负责把本地
Engine.dispatch() 适配成“房主权威 + 客户端指令”的模式。

战斗页面不再维护第二套在线渲染器：`online_session.js` 将房主和加入者
分别适配为 `CombatSession`，然后把状态、动作和事件交给单机的
`GameUI`。因此在线对战会直接复用单机 1v1 的卡牌、悬停说明、双击出牌、
颜色选择、技能弹窗、飘字和动画；在线层只负责大厅、P2P 信令和双方状态投影。
双方使用同一份共享牌库，手牌仍按角色私有投影传输。

## 本地检查

直接打开 index.html 可以查看界面；要真正建立房间，需要 HTTPS（或
localhost）和一个 WebSocket 信令端点。建议在项目根目录执行：

    node --check game/online_game/p2p_adapter.js
    node --check game/js/combat/session.js
    node --check game/online_game/online_session.js
    node --check game/online_game/online_match.js
    node --check game/online_game/online_ui.js
    node --check game/online_game/signaling/worker.js

提交前建议从仓库根目录运行：

    node game/scripts/check.js

## 部署信令 Worker

信令 Worker 与静态网页分开部署，Worker 不配置 assets，不会把仓库的
.git/objects 当作静态资源上传：

    cd game/online_game/signaling
    npx wrangler deploy --config wrangler.jsonc

部署后可以使用 https://<worker-domain>/health 检查服务。将生产信令地址
写入 `game/online_game/online_config.js` 的 `FURRY_SIGNAL_URL`，例如：

    https://<worker-domain>/online-signal

也可以在 Cloudflare 路由中把 /online-signal/* 绑定到该 Worker，然后
使用自己的网站域名作为信令地址。Worker 使用 Durable Object 按房间码
隔离连接，每个房间最多两人。
如需限制来源，可在 Worker 环境变量设置 `ALLOWED_ORIGINS`（多个来源用
逗号分隔）；Worker 同时拒绝超过 64 KiB 的信令消息。

## 当前范围与限制

- 仅配置公开 STUN：stun:stun.l.google.com:19302，没有 TURN 中继。
  对称 NAT、企业网络或严格移动网络可能无法直连。
- 房主运行完整单机 Engine，客户端只提交选牌、出牌、选色、选择防御
  和结束回合等指令；对手手牌不会发送给另一方。
- MVP 已覆盖单机引擎的普通 1v1 牌效和角色技能入口，并保留黑牌选色、
  Buff、特殊判定等协议字段；开局先手由房主统一投掷 12 面骰并广播。
  重连、结算后自动再战、种子随机数和更严
  格的令牌/Origin 校验属于下一阶段。
- 页面不再向玩家展示信令地址输入框；更换 Worker 或域名时由网站管理员
  修改 `online_config.js` 后重新部署静态网页。

不要把 npx wrangler deploy 在仓库根目录执行；信令 Worker 的配置目录已
独立放在这里，以避免 Cloudflare Workers Assets 上传整个 Git 历史。
