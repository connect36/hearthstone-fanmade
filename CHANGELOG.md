# 更新日志

## 2026-06-21 · P2 第一批：结算触发机制唤醒 + 腐蚀

### 新增机制接入（5种）
- **法术迸发 Spellburst**：友方法术结算后，场上法术迸发随从触发附效
  - 触发点：`resolveCardSolo` 玩家施法后 + `executeBossAction` Boss 施法后
  - `triggerSpellburstSolo(side)` 遍历场上未触发随从，一次性触发
- **暴怒 Frenzy**：随从首次受到伤害并存活后触发附效（圣盾/剧毒不触发）
  - 触发点：`dealMinionDamageSolo` 激怒检查之后
- **荣誉消灭 HonorableKill**：造成的伤害恰好等于目标当前生命值时触发
  - 双触发点：随从攻击 + 法术/效果伤害
  - 过量伤害/剧毒/圣盾不触发，对英雄无效
- **过量治疗 Overheal**：对随从的治疗量超过其缺失生命时触发（含满血治疗）
  - 触发点：`applyEffectsSolo` heal 分支，治疗结算后
- **腐蚀 Corrupt**：手牌中打出当前费用更高的牌时，腐蚀牌变为已腐蚀（打出时附效）
  - `mechanic-runtime.js` 新增 `checkAndApplyCorruption({ playedCard, playedEffectiveCost, hand, getEffectiveCost })`
  - 比较双方当前**实时费用**（非原始 card.cost）：减费/巨人折扣均生效
  - 触发点：`resolveCardSolo` 卡牌离手前

### 编辑器集成
- `mechanics.js` MECH_DEFS 扩充至 10 个（原 5 个 + 新增 5 个）
- `editor.js` / `editor-model.js` KNOWN_MECHANICS 同步
- `editor.html` 新增 5 个机制复选框

### 测试卡牌
- `mt-spellburst`（2费 2/3 法术迸发:抽1）
- `mt-frenzy`（3费 3/4 暴怒:+2攻）
- `mt-honorablekill-minion`（4费 3/3 荣誉消灭:抽1）
- `mt-honorablekill-spell`（3费 打3 荣誉消灭:召唤2/2）
- `mt-overheal`（3费 2/5 过量治疗:抽1）
- `mt-corrupt`（2费 2/2 腐蚀:+3/+3）

### 测试通过
- 88 项检查全部通过：9 语法 + 43 单元 + 25 集成 + 9 编辑器往返 + 11 编辑器模型
- 新增 17 项 P2 单元测试 + 15 项 P2 集成测试

## 2026-06-21 · 卡牌机制系统重构 (P0)

### 基础关键词补齐
- `keywords.js` KEYWORD_DEFINITIONS 扩充至12个：新增 charge、megaWindfury、stealth、elusive、immune
- `normalizeKeywords()` 不再错误过滤 charge、elusive 等已使用关键词
- 编辑器/卡面/AI/实战统一识别这12个关键词

### 新建机制模块
- `public/mechanics.js` — 统一卡牌状态评估 `evaluateCardPlayState()`，返回 playable/reason/activeMechanics/visualState
- `public/mechanic-conditions.js` — 条件判断函数：quickdraw/combo/outcast/finale/manathirst/holdingDragon/spellburst/frenzy/honorableKill/overheal
- `public/mechanic-runtime.js` — 运行时状态管理：cardsPlayedThisTurn/spellsPlayedThisTurn/damageTakenThisTurn/healingDoneThisTurn/enteredHandTurn

### 视觉状态三级体系
- `is-locked` — 灰色，不可使用（费用不足/目标不存在/场地满/非己方回合）
- `is-playable` — 绿色光晕，可正常打出
- `is-trigger-ready` — 金色脉冲光晕，条件机制已激活（快枪/连击/流放/压轴/法力渴求）
- `is-selected` — 蓝色，正在操作此牌（独立于以上三种）

### 运行时状态
- 玩家 runtime 新增 `cardsPlayedThisTurn: []`，卡牌打出时自动记录
- 卡牌实例新增 `enteredHandTurn` 字段追踪进入手牌的回合
- 回合开始时统一清零

### 测试通过
- 8 项机制测试全部通过：正常/快枪/快枪过期/连击/法力渴求/费用不足/流放/压轴

### Bug修复
- 修复 `getScriptForTurn()` 对字符串 `turnScript` 调用 `.find()` 崩溃
- 修复龙战AI返回的克隆对象引用导致随从重复攻击
- 修复 `executeBossAction` 的 attack/location 分支操作克隆对象而非真实状态
- 修复敌方回合结束时的残余攻击循环导致随从双倍打击
- 添加AI动作卡死检测（连续3次相同动作→强制结束回合）
- 添加无效动作跳过（执行后状态不变→跳过）

### AI架构重构
- `decideDragonWarriorAction` 改为只返回单个动作，全程在 `cloneState()` 上模拟
- App.js 改为逐动作请求-执行循环（请求→执行→渲染→重新请求）
- 删除旧的 `decideDragonWarriorTurn` 批量规划模式
- 删除回合末尾的残余自动攻击接管
- 攻击/地标执行全部改为通过 `instanceId` 查找真实对象

### 固定教学牌序
- `DW_DRAW_ORDER` 精确控制30张牌抽序
- 起手: 载蛋雏龙→黑暗龙骑士→龙巢守护者→晦鳞巢母
- T2进手: 乘风浮龙 ★  T4进手: 先觉蜿变幼龙 ★
- 禁用起手调度防止破坏顺序

### UI改进
- 结束回合按钮改为右侧悬浮大圆形，三色状态（灰/金/绿）
- 绿色仅当无可用动作时亮起（随从全攻击+手牌全不能出+技能已用）
- 敌方手牌/牌库改用蓝色叠堆与铭牌统一显示
- 手牌高度压缩（min-height 156→132px, padding缩减, gap 12→6px）
- 可交易按钮固定在卡牌右上角

## 2026-06-20 · 龙战AI陪练初版

### 新增文件
- `public/dragon-warrior-ai.js` — AI决策引擎
- `public/dragon-warrior-cards.js` — 30张火焰龙战卡牌
- `DRAGON_WARRIOR_AI_STRATEGY.md` — 完整策略文档
- `HANDOFF.md` — 项目交接文档

### 龙战AI系统
- 逐动作重新规划决策引擎
- 斩杀搜索（格罗玛什+赤红深渊 12伤 / 格罗玛什+裂隙 13伤）
- 龙锚点保护、火焰法术+火山顺序优化
- 晦鳞巢母返费后继续使用剩余法力
- 英雄技能与其他动作公平竞争

### 卡牌机制新增
- 武器系统（装备/攻击/耐久/动画: 飞入-挥砍-破碎）
- 英雄技能按钮（生命分流/全副武装, 翻转动画）
- 地标系统（耐久/冷却/移除, 赤红深渊+喷发火山完整实现）
- 黑暗之赐10种 + 三选一发现
- 烈火炙烤溢出回手
- 现场播报员回溯（评分决策+重新随机）
- 延系跨回合追踪
- 敌方手牌背面/牌库叠堆显示

### 效果处理器新增
- `equipWeapon`, `heroGainAttack`, `refreshMana`, `overflowDamage`
- `addRandomCard`, `drawMinion`, `enrageAttackBuff`, `damageOrDrawOrSummon`
- `discoverDragonWithDarkGift`, `discoverWarriorWithDarkGift`
- `locationPingBuff`, `locationRandomDamage`, `rewindableRandomWeapons`
- `endOfTurnBuffRandomFriendlyDragon`

### Bug修复
- 多米诺效应: 两边有随从时随机方向（原固定右）
- 血肉巨人: `healthChangesThisTurn` 仅玩家回合计数
- 亡者复生: 无友方死亡时禁用
- 指向性法术: 场上无随从时禁用
- 巡游向导: 英雄技能正确减为0费
- 塔姆辛: 伤害转移后治疗石仍有效
- 手牌增量渲染防闪烁

### 场景与模式
- 新增 `dragon-warrior` 场景（大厅🐉按钮）
- 龙战Boss拥有完整牌库/手牌/武器/地标系统
- `cardOnlyTargetsMinionsSolo` 指向性法术禁用逻辑
- 敌方手牌/牌库计数显示
