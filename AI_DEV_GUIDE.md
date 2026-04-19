# 炉边酒馆 · 开发与维护指南

## 项目根目录

- `/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone`

## 技术栈

- 后端：Node.js 原生 HTTP + `ws`
- 前端：原生 HTML / CSS / JavaScript ES Modules
- 数据：卡牌基础数据 + 浏览器本地覆盖 + PvP 服务端运行时状态

## 启动方式

```bash
cd "/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone"
npm install
npm start
```

常用测试端口：

```bash
PORT=3301 npm start
```

## 路由与页面

- `/`
  主游戏页，包含单关 Boss、单人测试版、LAN PvP
- `/editor`
  卡牌编辑器
- `/agents`
  工作日志与协作记录页
- `/api/meta`
  返回局域网访问信息
- `/api/healthz`
  返回服务健康状态

## 目录结构

```text
clawteam-lan-hearthstone/
├── server.mjs
├── server/
│   ├── game-engine.mjs
│   ├── protocol.mjs
│   └── rooms.mjs
├── public/
│   ├── app.js
│   ├── network.js
│   ├── game-data.js
│   ├── keywords.js
│   ├── card-overrides.js
│   ├── editor.html
│   ├── editor.js
│   ├── editor.css
│   ├── index.html
│   ├── styles.css
│   ├── agents.html
│   ├── agents-app.js
│   ├── agents.css
│   ├── agent-worklog.js
│   └── animations.js
├── README.md
├── AI_HANDOFF.md
├── AI_PROCESS.md
├── AI_CONCLUSION.md
├── GITHUB_PUBLISH.md
└── package.json
```

## 关键模块分工

### [public/game-data.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/game-data.js:1)

负责：

- 默认卡牌数据
- 默认牌组构成
- 单机关卡基础配置

适合在这里改：

- 默认卡牌
- 默认牌组数量
- Boss 关卡基础配置

### [public/card-overrides.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/card-overrides.js:1)

负责：

- 浏览器本地覆盖配置
- 编辑器改动落地
- 自定义卡牌覆盖默认数据

### [public/editor.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/editor.js:1)

负责：

- 编辑器的结构化表单
- `editorModel` 状态管理
- 自动描述生成
- 覆盖数据的保存与加载

关键原则：

- 结构化字段是第一真源
- 描述文本应该从结构化字段生成，而不是反过来驱动结构化字段

### [public/keywords.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/keywords.js:1)

负责：

- 关键词定义
- 关键词排序
- 随从运行时关键词辅助逻辑

如果要加新关键词，优先先改这里。

### [public/app.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/app.js:1)

负责：

- 主页面 UI 渲染
- 单机关卡逻辑
- 本地测试版逻辑
- PvP 客户端交互
- 目标高亮
- 本地保存与恢复

这是当前变动最多的文件。

### [public/network.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/network.js:1)

负责：

- WebSocket 连接
- 浏览器稳定 `clientId`
- PvP 消息分发
- 断线恢复时的身份保持

### [server/game-engine.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server/game-engine.mjs:1)

负责：

- PvP 权威结算
- 出牌、攻击、结束回合
- 法术目标合法性
- 关键词效果
- 死亡、复生、圣盾等战斗逻辑

只要是“联机里真正算不算数”的规则，最终都要以这里为准。

### [server/protocol.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server/protocol.mjs:1)

负责：

- 房间和对局消息结构
- 按玩家过滤状态
- 避免把不该看到的手牌/牌库信息发给对手

### [server/rooms.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server/rooms.mjs:1)

负责：

- 房间创建、加入、离开、解散
- 玩家与房间映射
- 断线后的房间清理与恢复窗口管理

### [server.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server.mjs:1)

负责：

- HTTP 入口
- 静态资源路由
- `/editor`、`/agents` 等页面分发
- WebSocket 入口与消息路由

## 新功能添加建议

### 添加新卡牌

优先路径：

1. 在 [public/game-data.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/game-data.js:1) 增加默认卡牌
2. 如果只想本地改而不改默认数据，也可以用 `/editor`

### 添加新效果类型

至少要检查三处：

1. 编辑器是否需要结构化字段
2. 单机逻辑是否支持
3. PvP 服务端是否支持

通常会涉及：

- [public/editor.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/editor.js:1)
- [public/app.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/app.js:1)
- [server/game-engine.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server/game-engine.mjs:1)

### 添加新关键词

建议顺序：

1. 先在 [public/keywords.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/keywords.js:1) 定义
2. 再接入单机运行时
3. 再接入 PvP 服务端
4. 最后补编辑器勾选 UI

### 修改目标系统

目标系统是最容易出现“编辑器能改、实战不一致”的地方。

改动时必须一起看：

- [public/editor.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/editor.js:1)
- [public/app.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/app.js:1)
- [server/game-engine.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server/game-engine.mjs:1)

特别注意：

- `由玩家决定`
- `相同目标`
- 友方 / 敌方 / 英雄 / 随从区分
- 前端高亮与服务端合法性校验保持一致

## 保存与恢复机制

### 单人模式

单人 `Boss / 本地测试版` 会把局面保存在浏览器本地。

如果改这里，要重点看：

- `localStorage` key 设计
- URL 参数同步
- 重开 / 重新开始时是否会清错状态

### PvP 模式

PvP 依赖：

- `clientId`
- 房间号
- 服务端恢复窗口

如果动了这些逻辑，要重点回归：

- 等待房间时刷新
- 游戏进行中刷新
- 房主退出
- 非房主退出
- 房间解散

## UI 修改注意点

### 主页面

主页面的元素需要同时检查：

- [public/index.html](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/index.html:1)
- [public/styles.css](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/styles.css:1)
- [public/app.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/app.js:1)

### 编辑器页面

编辑器相关改动需要同时检查：

- [public/editor.html](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/editor.html:1)
- [public/editor.css](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/editor.css:1)
- [public/editor.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/editor.js:1)

### `/agents` 页面

如果改日志页或展示结构，同时检查：

- [public/agents.html](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/agents.html:1)
- [public/agents.css](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/agents.css:1)
- [public/agents-app.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/agents-app.js:1)
- [public/agent-worklog.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/agent-worklog.js:1)

## 推荐测试清单

改完代码后，至少回归这些：

- 单关 Boss 能正常开始
- 本地测试版能正常开始
- 建房 / 加入房间正常
- 双方准备后能进入对局
- 法术目标高亮正确
- `由玩家决定` 能选任意合法目标
- `相同目标` 跟随主目标
- `圣盾 / 剧毒 / 吸血 / 风怒 / 复生 / 嘲讽` 正常
- 单人刷新后能恢复
- PvP 刷新后能恢复到房间或当前对局
- 手机窄屏布局没有明显错位

## 推荐命令

### 语法检查

```bash
node --check public/app.js
node --check public/editor.js
node --check public/network.js
node --check public/keywords.js
node --check server/game-engine.mjs
node --check server/protocol.mjs
node --check server/rooms.mjs
node --check server.mjs
```

### 启动服务

```bash
PORT=3301 npm start
```

### 健康检查

```bash
curl -I http://127.0.0.1:3301/
curl http://127.0.0.1:3301/api/healthz
```

## 文档维护规则

改功能时建议同步更新：

- [README.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/README.md:1)
  面向人类读者的总览
- [AI_CONCLUSION.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/AI_CONCLUSION.md:1)
  当前稳定状态
- [AI_PROCESS.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/AI_PROCESS.md:1)
  调试和迭代经过
- [GITHUB_PUBLISH.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/GITHUB_PUBLISH.md:1)
  发布状态与 GitHub 最后一步
