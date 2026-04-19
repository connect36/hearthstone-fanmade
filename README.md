# 炉边酒馆 · LAN 炉石风卡牌游戏

一个基于浏览器的炉石风小游戏，包含：

- 单人单关 Boss 战
- 单人本地测试版
- 局域网双人对战
- 内置卡牌编辑器
- `/agents` 协作日志页

项目目录：

- `/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone`

## 当前特性

### 玩法模式

- `单关 Boss 战`
  在限定回合压力下击败预设 Boss。
- `本地测试版`
  一个人也能测试整套出牌、攻击、目标选择和回合流程。
  对手每个敌方回合会：
  - 获得 `5` 点护甲
  - 召唤 `1` 个 `2/2` 随从
- `局域网双人对战`
  同一局域网内的电脑和手机可以直接访问同一个地址进行对战。

### 卡牌与机制

当前已支持的基础效果：

- `damage`
- `heal`
- `armor`
- `draw`
- `summon`
- `buff`
- `conditional`

当前已支持的关键词：

- `嘲讽`
- `剧毒`
- `复生`
- `圣盾`
- `吸血`
- `风怒`

规则补充：

- `嘲讽` 会强制攻击者优先攻击带嘲讽的随从。
- `复生` 触发后只会把生命变成 `1`，其余关键词效果和攻击力会保留，`复生` 本身只触发一次。
- `由玩家决定` 的伤害/治疗目标可以是任意英雄或任意随从，包括友方。

### 编辑器

编辑器支持修改：

- 卡牌名称
- 费用
- 类型
- 启用 / 禁用
- 起始牌组数量
- 随从攻击 / 生命
- 随从关键词
- 法术伤害值 / 目标
- 治疗 / 护甲 / 抽牌数值
- 召唤数量 / 名称 / 攻击 / 生命 / 关键词
- 条件触发和条件奖励
- 高级 `JSON` 效果

### 进度恢复

- `单人 Boss 战` 和 `本地测试版`
  会把当前局面保存在浏览器本地。
  刷新页面、关闭浏览器再打开后，默认会尝试恢复。
- `局域网双人对战`
  浏览器会保留稳定本地身份。
  同一设备刷新或重新打开页面时，会尝试回到原来的房间或进行中的对局。
  服务端当前保留断线恢复窗口约 `5 分钟`。

## 运行方式

```bash
cd "/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone"
npm install
npm start
```

默认运行在 `3000` 端口。

如果想用自定义端口：

```bash
PORT=3301 npm start
```

服务器监听在 `0.0.0.0`，同一局域网里的其他设备也能访问。

## 主要入口

- `/`
  主游戏页面
- `/editor`
  卡牌编辑器
- `/agents`
  manager / agents 工作记录页
- `/api/meta`
  当前局域网访问地址
- `/api/healthz`
  服务健康检查

常见示例：

- [http://127.0.0.1:3301/](http://127.0.0.1:3301/)
- [http://127.0.0.1:3301/editor](http://127.0.0.1:3301/editor)
- [http://127.0.0.1:3301/agents](http://127.0.0.1:3301/agents)

## URL 约定

为了让恢复逻辑更稳定，页面会使用不同的模式 URL：

- `/?mode=solo&scenario=boss`
- `/?mode=solo&scenario=test`
- `/?mode=pvp&room=ABCD`

## 项目结构

```text
clawteam-lan-hearthstone/
├── server.mjs
├── server/
│   ├── game-engine.mjs
│   ├── protocol.mjs
│   └── rooms.mjs
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── network.js
│   ├── game-data.js
│   ├── keywords.js
│   ├── card-overrides.js
│   ├── animations.js
│   ├── editor.html
│   ├── editor.css
│   ├── editor.js
│   ├── agents.html
│   ├── agents.css
│   ├── agents-app.js
│   └── agent-worklog.js
├── README.md
├── AI_HANDOFF.md
├── AI_PROCESS.md
├── AI_CONCLUSION.md
├── AI_DEV_GUIDE.md
├── package.json
└── package-lock.json
```

## 核心文件说明

- [server.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server.mjs:1)
  HTTP 服务、静态资源路由、WebSocket 连接、房间事件与断线恢复窗口。

- [server/game-engine.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server/game-engine.mjs:1)
  PvP 的服务端权威战斗逻辑。

- [server/protocol.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server/protocol.mjs:1)
  房间消息和按玩家过滤后的对局状态。

- [public/app.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/app.js:1)
  单人模式、测试模式、PvP 客户端渲染、交互、恢复逻辑。

- [public/network.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/network.js:1)
  WebSocket 客户端封装，包含稳定浏览器身份。

- [public/keywords.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/keywords.js:1)
  关键词定义、排序和随从运行时状态辅助函数。

- [public/editor.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/editor.js:1)
  卡牌编辑器逻辑，`editorModel` 是结构化编辑的主状态。

## 验证建议

如果要自己快速验一轮，推荐按这个顺序：

1. 打开 `本地测试版`
2. 出一张法术，确认目标高亮和目标选择正常
3. 出一个带关键词的随从，测试攻击/复生/圣盾等交互
4. 刷新页面，确认单人局面被恢复
5. 再开一局双人房间，刷新其中一边，确认能回到原房间/原对局

## 已知边界

- 编辑器对结构化效果支持很好，但极复杂的多层嵌套效果仍然更适合写在额外 `JSON` 里。
- 双人恢复依赖：
  - 同一台设备
  - 同一个浏览器本地身份
  - 服务端仍在运行
- 当前没有观战系统，也没有聊天系统。

## AI 文档

- [AI_HANDOFF.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/AI_HANDOFF.md:1)
  AI 交接入口索引
- [AI_CONCLUSION.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/AI_CONCLUSION.md:1)
  当前稳定结论
- [AI_PROCESS.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/AI_PROCESS.md:1)
  开发过程与排查记录
- [AI_DEV_GUIDE.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/AI_DEV_GUIDE.md:1)
  面向后续开发者 / AI 的维护说明
