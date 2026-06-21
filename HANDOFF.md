# 炉石传说游戏自制 — 项目交接文档

> 日期：2026-06-21  
> 版本：v2.1  
> 项目路径：`/Users/ruiliu/Documents/炉石传说游戏自制`

---

## 1. 已完成内容

### 1.1 核心游戏系统
- Solo 单人模式（Boss 战 / 本地测试 / 龙战 AI）
- PvP 局域网双人对战（WebSocket 房间制）
- 卡牌编辑器（五层模型：卡牌 → 效果组 → 效果 → 条件 → 目标）
- 酒馆战棋 MVP 路由（独立界面入口）
- Agent 工作日志系统

### 1.2 卡牌机制
| 机制 | 状态 |
|------|------|
| 战吼/亡语/任务线 | ✅ 完整 |
| 可交易（Tradeable） | ✅ |
| 多米诺效应（连锁伤害） | ✅ 随机方向 |
| 黑暗之赐（10 种礼物） | ✅ 三选一发现 |
| 地标（Locations） | ✅ 耐久/冷却/移除 |
| 武器系统 | ✅ 装备/攻击/动画 |
| 英雄技能按钮 | ✅ 翻转动画 |
| 烈火炙烤溢出回手 | ✅ |
| 现场播报员回溯 | ✅ |
| 延系（Kindred） | ✅ 跨回合追踪 |
| 手牌增量渲染 | ✅ 防止闪烁 |
| 敌方手牌/牌库显示 | ✅ 龙战 AI 场景 |

### 1.3 龙战 AI 系统
- 30 张火焰龙战套牌（Vicious Syndicate 牌表）
- 逐动作重新规划决策引擎（克隆→模拟→评估→选择）
- 斩杀搜索（格罗玛什+赤红深渊 12 伤 / 格罗玛什+裂隙 13 伤）
- 龙锚点保护（不打掉最后一条龙）
- 火焰法术+喷发火山顺序优化
- 晦鳞巢母返费后继续使用剩余法力
- 英雄技能与出牌公平竞争
- 起手调度（保留/换牌）
- 牌序固定最优排序（1 费龙 → 中期 → 格罗玛什最后）

### 1.4 动画系统
- 卡牌翻转入场（抽牌）
- 攻击前冲/震动
- 武器装备飞入/挥砍/破碎
- 英雄技能按钮翻转
- 回合 Banner / Toast 提示
- 浮动战斗数字

---

## 2. 修改文件清单

### 核心游戏文件

| 文件 | 行数 | 职责 |
|------|------|------|
| `public/app.js` | 5,333 | 主游戏逻辑：Solo/PvP/AI、效果处理器、UI渲染 |
| `public/styles.css` | 2,540 | 全部样式（大厅/战场/武器/动画/响应式） |
| `public/index.html` | 360 | 页面结构（大厅/英雄面板/战场/手牌区） |

### 数据 & 引擎

| 文件 | 行数 | 职责 |
|------|------|------|
| `public/game-data.js` | 379 | 卡牌数据库、套牌定义、场景配置 |
| `server/game-engine.mjs` | 1,269 | PvP 服务端游戏引擎 |
| `server.mjs` | 540 | HTTP + WebSocket 服务器 |
| `server/protocol.mjs` | — | PvP 通信协议定义 |
| `server/rooms.mjs` | — | PvP 房间管理 |

### 龙战 AI 专属

| 文件 | 行数 | 职责 |
|------|------|------|
| `public/dragon-warrior-ai.js` | 528 | AI 决策引擎：评估/生成/模拟/搜索 |
| `public/dragon-warrior-cards.js` | 239 | 30 张龙战卡牌数据 + 套牌定义 |
| `DRAGON_WARRIOR_AI_STRATEGY.md` | — | 完整策略规格文档 |

### 编辑器 & 工具

| 文件 | 职责 |
|------|------|
| `public/editor.html` / `.js` / `.css` | 卡牌编辑器 |
| `public/editor-library.html` / `.js` / `.css` | 卡牌库管理 |
| `public/card-overrides.js` | 编辑器覆盖存储 |
| `public/keywords.js` | 关键词/种族系统 |
| `public/animations.js` | 通用动画引擎 |
| `public/network.js` | PvP WebSocket 客户端 |

### 扩展模块

| 文件 | 职责 |
|------|------|
| `public/battlegrounds-view.js` / `.css` | 酒馆战棋界面 |
| `public/agents-app.js` / `.html` / `.css` | Agent 工作日志 |
| `scripts/verify-questline.mjs` | 任务线验证脚本 |

---

## 3. 当前已知问题

### 3.1 龙战 AI
1. **束搜索深度仅为 1** — 当前逐动作重新规划只模拟一步，尚未实现深度 2-4 的完整束搜索。
2. **地标 AI 模拟简化** — 喷发火山在模拟中使用随机伤害，实际结算可能有偏差。
3. **回溯评分简化** — 现场播报员回溯使用阈值判断，未实现完整两阶段评估。
4. **黑暗之赐 AI 选择** — Boss 侧自动选择最优，无玩家交互 UI。
5. **Boss 武器显示** — 敌方武器槽在非龙战场景隐藏，但渲染函数仍运行。

### 3.2 通用
6. **PvP 对战中英雄技能按钮** — 仅 Solo 模式有 UI，PvP 模式未适配。
7. **卡牌编辑器不自动更新游戏** — 编辑后需手动刷新页面。
8. **敌方手牌仅在龙战场景显示** — 其他 Boss 场景隐藏。
9. **手机端地标/武器显示偏小** — 未做移动端专项适配。
10. **服务器重启后房间消失** — 无持久化存储。

---

## 4. 尚未实现机制

| 机制 | 说明 |
|------|------|
| 完整束搜索（深度 2-4） | AI 当前只模拟一步，未展开搜索树 |
| 黑暗之赐玩家选择 UI | Boss 自动选择，玩家无交互 |
| 回溯玩家 UI | 仅 AI 自动决策回溯 |
| 手机端武器/地标响应式 | 布局未适配小屏 |
| PvP 英雄技能按钮 | 双人模式未显示技能按钮 |
| 游戏录像/回放 | 无 |
| 音效系统 | 无 |
| 卡组导入（deck code） | 数据结构已预留，解析器未实现 |
| 服务器持久化 | 重启丢失所有房间和进度 |
| AI 难度选择 | 仅一种难度 |

---

## 5. 各模式与路由

### URL 路由

| 路径 | 模式 | 说明 |
|------|------|------|
| `/` | 大厅 | 选择游戏模式 |
| `/?mode=solo&scenario=test` | 本地测试 | 沙包陪练，Boss 每回合+5甲+召唤2/2 |
| `/?mode=solo&scenario=boss` | Boss 战 | 寒炉督战者·柯沃 |
| `/?mode=solo&scenario=dragon-warrior` | 龙战 AI | 火焰龙战完整套牌 AI 陪练 |
| `/editor` | 编辑器 | 卡牌数据编辑 |
| `/editor/library` | 卡牌库 | 卡牌浏览管理 |
| `/agents` | Agent 日志 | AI 工作记录查看 |

### 大厅按钮
- 🏠 创建房间（PvP 房主）
- 🚪 加入房间（PvP 客机）
- 🧪 本地测试版
- 🐉 龙战 AI 陪练
- ⚔️ 酒馆战棋 MVP

---

## 6. 启动与测试方法

### 启动服务器
```bash
cd /Users/ruiliu/Documents/炉石传说游戏自制
node server.mjs
# 监听 0.0.0.0:3301
# HTTP:  http://127.0.0.1:3301
# WebSocket: ws://127.0.0.1:3301
```

### 测试场景
```bash
# 本地测试（沙包陪练）
open http://127.0.0.1:3301/?mode=solo&scenario=test

# 龙战 AI 陪练
open http://127.0.0.1:3301/?mode=solo&scenario=dragon-warrior

# Boss 战
open http://127.0.0.1:3301/?mode=solo&scenario=boss

# 编辑器
open http://127.0.0.1:3301/editor
```

### 语法检查
```bash
node --check public/app.js
node --check public/dragon-warrior-ai.js
node --check public/dragon-warrior-cards.js
node --check public/game-data.js
node --check server/game-engine.mjs
node --check server.mjs
```

### 回归测试
```bash
# 确保三个场景都能加载
curl -s 'http://127.0.0.1:3301/?mode=solo&scenario=test' | grep -c 'game-card'
curl -s 'http://127.0.0.1:3301/?mode=solo&scenario=boss' | grep -c 'game-card'
curl -s 'http://127.0.0.1:3301/?mode=solo&scenario=dragon-warrior' | grep -c 'enemy-hand-zone'
```

---

## 7. 下一步任务

### P0（阻塞线上）
- [ ] 完整束搜索（深度 2-4），显著提升 AI 强度
- [ ] 手机端适配武器/地标/敌方手牌显示

### P1（高优先级）
- [ ] 黑暗之赐玩家选择 UI（弹出三选一）
- [ ] 现场播报员回溯玩家交互
- [ ] PvP 模式添加英雄技能按钮
- [ ] 修复已知问题清单中的 1-5 项

### P2（功能增强）
- [ ] Deck code 导入/导出
- [ ] AI 难度选择（简单/普通/困难）
- [ ] 服务器游戏状态持久化
- [ ] 游戏录像/回放
- [ ] 音效系统

### P3（锦上添花）
- [ ] 更多 AI 套牌（任务术 AI 陪练等）
- [ ] 移动端 PWA 支持
- [ ] 数据统计面板（胜率/空过法力/未打出牌）
- [ ] 国际化 (i18n)

---

## 8. 关键代码路径速查

| 功能 | 文件:行号 |
|------|----------|
| 初始化 Solo | `app.js:1293` |
| Boss 回合 | `app.js:3615` |
| 龙战 Boss 回合 | `app.js:3726` |
| 效果处理入口 | `app.js:2731` |
| 黑暗之赐 | `app.js:3708` |
| 武器渲染 | `app.js:4220` |
| 敌方手牌渲染 | `app.js:4253` |
| AI 决策入口 | `dragon-warrior-ai.js:448` |
| AI 模拟执行 | `dragon-warrior-ai.js:83` |
| 斩杀搜索 | `dragon-warrior-ai.js:299` |
| 卡牌数据库 | `game-data.js:172` |
| 龙战卡牌 | `dragon-warrior-cards.js:1` |
| 场景配置 | `app.js:78` |
| 英雄技能渲染 | `app.js:4182` |
| 起手调度 | `app.js:1356` |
| PvP 引擎 | `game-engine.mjs:1` |

---

**最后更新**：2026-06-21  
**维护者**：Claude Code (connect36)
