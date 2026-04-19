# 炉边酒馆 · 当前稳定结论

## 项目根目录

- `/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone`

## 项目是什么

这是一个基于浏览器的炉石风小游戏，当前包含：

- 单关 Boss 战
- 单人本地测试版
- 局域网双人对战
- 卡牌编辑器
- `/agents` 协作日志页

整体目标是：

- 电脑和手机都能玩
- 同一局域网设备直接访问
- 不依赖前端框架

## 如何运行

```bash
cd "/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone"
npm install
npm start
```

自定义端口示例：

```bash
PORT=3301 npm start
```

服务监听：

- `0.0.0.0`

## 主要路由

- `/`
  主游戏页
- `/editor`
  卡牌编辑器
- `/agents`
  manager / agents 日志页
- `/api/meta`
  局域网地址信息
- `/api/healthz`
  健康检查

## 当前支持的玩法模式

### 1. 单关 Boss 战

特点：

- 单人游玩
- 一关 Boss 压力战
- 支持随从、法术、护甲、治疗、抽牌、召唤、增益等基础流程

### 2. 本地测试版

用途：

- 一个人快速测试机制，不必再开第二台设备

当前规则：

- 对手名称为 `测试陪练`
- 每个敌方回合获得 `5` 点护甲
- 每个敌方回合召唤 `1` 个 `2/2` 随从

### 3. 局域网双人对战

特点：

- 可建房 / 加入房间
- 双方准备后开始
- 局域网内电脑和手机都能加入
- 支持目标选择、出牌、攻击、结束回合、胜负判定

## 当前卡牌模型

基础卡牌数据在：

- [public/game-data.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/game-data.js:1)

主要字段围绕下面这类结构：

```js
{
  id,
  name,
  cost,
  type,
  text,
  attack,
  health,
  keywords,
  effects
}
```

## 当前支持的效果类型

- `damage`
- `heal`
- `armor`
- `draw`
- `summon`
- `buff`
- `conditional`

## 当前支持的关键词

关键词共享模块在：

- [public/keywords.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/keywords.js:1)

已支持：

- `嘲讽`
  有嘲讽时必须优先攻击嘲讽随从。
- `剧毒`
  如果伤害命中随从，会直接致死。
- `圣盾`
  吸收第一次受到的伤害。
- `吸血`
  按造成的伤害为己方英雄回复生命。
- `风怒`
  每回合可攻击两次。
- `复生`
  死亡后以 `1` 血复活一次，同时保留其他关键词效果和原本攻击力。

显示顺序上，`复生` 固定排在最后。

## 当前目标系统规则

当前目标系统已经统一到编辑器、单机运行时和 PvP 服务端。

规则包括：

- `由玩家决定`
  可以选择任意英雄或任意随从，包含友方和敌方。
- `敌方英雄 / 敌方随从 / 己方英雄 / 己方随从`
  会按类型限制可点击目标。
- `相同目标`
  条件后续效果会跟随主效果第一次选中的那个目标。
- 当前可选目标会有高亮提示。

## 当前抽牌与开场规则

对战开始时：

- 会播放接近全屏的先后手提示动画
- 先手开局 `3` 张，自己第一回合开始再抽 `1` 张，所以第一回合是 `4` 张
- 后手开局 `4` 张，自己第一回合开始再抽 `1` 张，所以第一回合是 `5` 张
- 后续每回合开始再抽 `1` 张
- 打出去的牌离开手牌，没打的牌保留到下一回合

## 卡牌编辑器当前能力

编辑器文件：

- [public/editor.html](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/editor.html:1)
- [public/editor.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/editor.js:1)
- [public/editor.css](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/editor.css:1)
- [public/card-overrides.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/card-overrides.js:1)

编辑器当前可修改：

- 卡牌名称
- 费用
- 类型
- 启用 / 禁用
- 起始牌组数量
- 随从攻击 / 生命
- 随从关键词
- 法术伤害值
- 法术目标
- 治疗 / 护甲 / 抽牌值
- 召唤数量 / 名称 / 攻击 / 生命 / 关键词
- 条件触发
- 条件奖励类型
- 条件目标
- 条件奖励值
- 高级 `JSON` 效果

编辑器当前特性：

- `editorModel` 作为结构化真源
- 可从结构化字段自动生成描述文本
- 浏览器本地保存覆盖配置
- 可以新建模板卡牌

## 当前保存与恢复机制

### 单人模式

- `Boss 战` 与 `本地测试版` 都会把局面保存到浏览器本地
- 刷新页面、关闭浏览器再打开，默认会尝试恢复上次进度

### PvP 模式

- 浏览器会保留稳定本地身份
- 同一设备刷新或重新打开页面时，会尝试回到原来的房间或当前对局
- 服务端当前保留断线恢复窗口约 `5 分钟`

### URL 约定

为了让恢复更稳定，页面会使用不同查询参数：

- `/?mode=solo&scenario=boss`
- `/?mode=solo&scenario=test`
- `/?mode=pvp&room=ABCD`

## 主要运行时文件

- [public/app.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/app.js:1)
  主客户端逻辑，包含单人、测试版、PvP 界面与交互。

- [public/network.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/network.js:1)
  WebSocket 客户端封装，负责稳定客户端身份和消息处理。

- [server/game-engine.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server/game-engine.mjs:1)
  PvP 服务端权威结算逻辑。

- [server/protocol.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server/protocol.mjs:1)
  消息协议与按玩家过滤后的状态输出。

- [server/rooms.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server/rooms.mjs:1)
  房间、玩家映射和房间生命周期管理。

- [server.mjs](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/server.mjs:1)
  HTTP 服务、静态资源路由、WebSocket 接入与 API。

## 当前已知边界

- 编辑器对结构化效果支持已经比较完整，但极复杂的多层嵌套效果仍更适合放在额外 `JSON`。
- PvP 恢复依赖：
  - 同一台设备
  - 同一个浏览器本地身份
  - 服务端仍在运行
- 当前没有观战系统。
- 当前没有聊天系统。
- 多设备浏览器级全链路自动化测试还不完整，主要依靠定向断言和手工联调。

## 建议阅读顺序

1. 先看 [README.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/README.md:1)
2. 再看这个文件，理解当前稳定状态
3. 然后看 [AI_DEV_GUIDE.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/AI_DEV_GUIDE.md:1)
4. 需要历史背景时，再看 [AI_PROCESS.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/AI_PROCESS.md:1)
