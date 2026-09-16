# Furry Trial 在线对决（小规模 MVP）

这个目录是静态网页的联机入口。牌面、角色技能、Buff、牌库和事件仍由
game/js/combat/ 的单机代码提供，online_match.js 只负责把本地
Engine.dispatch() 适配成“房主权威 + 客户端指令”的模式。

战斗页面不再维护第二套在线渲染器：`online_session.js` 将房主和加入者
分别适配为 `CombatSession`，然后把状态、动作和事件交给单机的
`GameUI`。因此在线对战会直接复用单机 1v1 的卡牌、悬停说明、双击出牌、
颜色选择、技能弹窗、飘字和动画；在线层只负责大厅、传输和双方状态投影。
双方使用同一份共享牌库，手牌仍按角色私有投影传输。

战斗数据优先使用 WebRTC DataChannel。若玩家开始对战时直连仍未建立，
会暂时通过信令 WebSocket 中继；直连通道建立后自动升级回 P2P。它不依赖
TURN，适合当前小规模上线阶段；直连不可用时仍可完整进行中继对战。

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
隔离连接，每个房间最多两人。浏览器刷新不会主动发送离开消息：大厅会把
房间码、角色、准备状态和 Worker 发放的重连令牌保存在本地，并在检测到
reload 后自动恢复。Worker 会在旧连接关闭后保留 15 秒的重连窗口，令牌
连接会原子替换旧 WebSocket，不会产生重复房主或“房间已满”。点击“离开
房间”、返回主页或游戏结束返回主页则会清除本地会话并立即释放名额。
房主在对局中的权威快照也会随会话保存；刷新后会重建战斗并向客机发送
最新私有投影，客机刷新则向房主请求同一对局快照。
如需限制来源，可在 Worker 环境变量设置 `ALLOWED_ORIGINS`（多个来源用
逗号分隔）；Worker 同时拒绝超过 64 KiB 的信令消息。

## 当前范围与限制

- 仅配置公开 STUN：stun:stun.l.google.com:19302，没有 TURN 中继。
  对称 NAT、企业网络或严格移动网络可能无法直连。
- 房主运行完整单机 Engine，客户端只提交选牌、出牌、选色、选择防御
  和结束回合等指令；对手手牌不会发送给另一方。
- 联机指令带有协议版本、对局 ID、单调状态版本和请求编号；房主会校验
  行动者、阶段、待决策和参数，并对重复请求返回缓存结果。客机只接受
  当前对局的更新，不接受旧快照回退。
- MVP 已覆盖单机引擎的普通 1v1 牌效和角色技能入口，并保留黑牌选色、
  Buff、特殊判定等协议字段；开局先手由房主统一投掷 12 面骰并广播。
  结算后自动再战、种子随机数和更严格的令牌校验属于下一阶段；Worker 已
  支持可选的 Origin 白名单、握手超时、消息大小、基础频率限制和短时重连令牌。
- 页面不再向玩家展示信令地址输入框；更换 Worker 或域名时由网站管理员
  修改 `online_config.js` 后重新部署静态网页。

不要把 npx wrangler deploy 在仓库根目录执行；信令 Worker 的配置目录已
独立放在这里，以避免 Cloudflare Workers Assets 上传整个 Git 历史。
