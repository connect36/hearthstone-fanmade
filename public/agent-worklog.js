export const dashboardMeta = {
  title: 'ClawTeam 工作记录',
  subtitle: '查看 Manager 与 A / B / C / D 的当前状态、交互过程、实际改动和产生的效果。',
  summary:
    '这个页面现在不再只写“谁负责哪一块”，而是把任务怎么分配、agent 实际做了什么、manager 如何整合、最终对项目产生了什么效果，逐条展开记录。后续你继续提修改时，也可以沿着这套格式继续追加。',
  lastUpdated: '2026-04-12 22:04',
};

export const statusBoard = [
  {
    code: 'Manager',
    state: 'active',
    stateLabel: '正在修编辑器漏洞',
    focus: '把条件机制改成可视化字段，并让数值变化自动同步卡牌文字，不再要求用户手改 JSON。',
    effect: '像“背水一击”这种带条件追加效果的法术，现在可以直接在编辑器里改机制，文字也会同步更新。',
  },
  {
    code: 'A',
    state: 'completed',
    stateLabel: '逻辑已交付',
    focus: '单关战斗循环、回合法力、出牌、Boss 行动和 LAN 启动入口。',
    effect: '游戏已经能在浏览器里进入单关 Boss 战流程。',
  },
  {
    code: 'B',
    state: 'completed',
    stateLabel: 'UI 已交付',
    focus: '游戏主界面的布局、手机适配、酒馆氛围和展示容器。',
    effect: '电脑和手机都能较舒适地浏览并操作当前游戏界面。',
  },
  {
    code: 'C',
    state: 'completed',
    stateLabel: '数据已交付',
    focus: '卡牌池、Boss 设定、回合脚本、规则目标。',
    effect: '当前这关有明确的单关目标、Boss 压力节奏和卡牌策略空间。',
  },
  {
    code: 'D',
    state: 'standby',
    stateLabel: '轻量动画在线',
    focus: '抽牌、受击、治疗、回合横幅和胜负提示反馈。',
    effect: '页面已经有战斗反馈，但还不是重型炉石特效风格。',
  },
];

export const interactionFeed = [
  {
    time: '22:01',
    from: 'User',
    to: 'Manager',
    kind: '需求',
    title: '发起炉石风单关项目',
    detail: '用户要求用 Manager / A / B / C / D 方案做一个只有一关的炉石传说风格网页游戏，并明确 A 写代码、B 做 UI、C 设计卡牌、D 做动画，同时要求适配电脑和手机，并能在整个局域网设备上访问。',
    effect: 'Manager 先做底座选型，没有直接从零开始，而是优先寻找现有可复用的 LAN 项目。',
  },
  {
    time: '22:03',
    from: 'Manager',
    to: 'A / B / C / D',
    kind: '派单',
    title: '并行拆分任务',
    detail: 'Manager 把主逻辑与服务端交给 A，把视觉和响应式布局交给 B，把卡牌与关卡数据交给 C，把动画反馈模块交给 D，并要求所有结果最终汇合到同一个新项目目录中。',
    effect: '四条工作线并行推进，缩短了首版落地时间。',
  },
  {
    time: '22:08',
    from: 'C',
    to: 'Manager',
    kind: '回报',
    title: '先交付 Boss 与卡牌数据',
    detail: 'C 先完成 10 张卡、12 张起始牌组、1 个 Boss 和单关规则说明，但第一次把文件写进了旧目录 `clawteam-lan-snake/public/game-data.js`。',
    effect: 'Manager 发现路径不对后要求 C 把同样的内容迁移到新项目目录，避免后面接线时出错。',
  },
  {
    time: '22:11',
    from: 'D',
    to: 'Manager',
    kind: '回报',
    title: '交付轻量动画模块',
    detail: 'D 把抽牌、受击、治疗、回合横幅、胜利、失败等反馈收敛进 `public/animations.js`，并且做了无动画能力浏览器的优雅降级。',
    effect: 'Manager 后续整合主逻辑时可以直接调用这套接口，而不用重新发明动画层。',
  },
  {
    time: '22:14',
    from: 'B',
    to: 'Manager',
    kind: '回报',
    title: '交付游戏界面骨架',
    detail: 'B 完成了敌方英雄区、战场区、玩家英雄区、手牌区、按钮区、LAN 区、日志区与提示区的结构和样式，并处理了手机与桌面布局差异。',
    effect: '页面有了稳定的响应式骨架，但真正的战斗逻辑还需要和 A 的代码对齐。',
  },
  {
    time: '22:18',
    from: 'Manager',
    to: '自己',
    kind: '验收',
    title: '识别出 A/B 结果不兼容',
    detail: 'Manager 检查后发现 A 的初版 `app.js` 依赖的 DOM id/class 与 B 的最终 UI 容器并不一致，如果直接用会导致前端运行错误或空白块。',
    effect: 'Manager 决定接手整合，而不是盲目继续等待 A 修完，避免项目卡住。',
  },
  {
    time: '22:23',
    from: 'Manager',
    to: '项目代码',
    kind: '整合',
    title: '重写主逻辑并统一目录',
    detail: 'Manager 重写 `server.mjs` 为稳定的静态服务 + `/api/meta` + `/api/healthz`，同时把 `public/app.js` 改成真正贴合 B 的 UI、C 的数据结构、D 的动画接口的单关 Boss 战控制流。',
    effect: '游戏正式从“分散的 worker 产物”变成“能跑起来的完整项目”。',
  },
  {
    time: '22:27',
    from: 'Manager',
    to: '项目运行环境',
    kind: '验证',
    title: '发现并绕开端口冲突',
    detail: 'Manager 发现 3000 端口被其他项目占用，第一次 curl 实际命中了错误站点，所以临时改用 3301 和 3302 做校验，再回头确认原服务进程的 cwd。',
    effect: '避免把别的服务误当成当前项目，验证结果变得可信。',
  },
  {
    time: '22:31',
    from: 'User',
    to: 'Manager',
    kind: '新需求',
    title: '要求展示 agents 工作状态',
    detail: '用户提出想在页面中看到 agents 的工作状态，随后又进一步要求不要只写在游戏侧栏，而是把工作记录和当前状态放到 `3301/agents` 的独立页面。',
    effect: 'Manager 先加了侧栏版，再按新要求移除侧栏，把它升级为独立工作记录页。',
  },
  {
    time: '22:35',
    from: 'Manager',
    to: '项目代码',
    kind: '升级',
    title: '重构 /agents 页面',
    detail: 'Manager 移除了游戏页里的 agents 面板，新增 `agents.html`、`agents.css`、`agents-app.js`、`agent-worklog.js`，并给 `/agents` 和 `/agents/` 加了正式路由。',
    effect: '现在你可以单独打开 `/agents` 看交互过程、分工状态、每个 agent 的具体动作和效果。',
  },
  {
    time: '22:43',
    from: 'User',
    to: 'Manager',
    kind: '新需求',
    title: '规范卡牌文案显示',
    detail: '用户要求：卡牌只有在真的有特殊效果时才写说明；普通白板卡不要再出现建议、评价或类似“中期最稳的战力卡”的文字。',
    effect: 'Manager 开始同时修改卡牌数据和前端渲染逻辑，确保规则被真正执行，而不是只改文案。',
  },
  {
    time: '22:56',
    from: 'User',
    to: 'Manager',
    kind: '新需求',
    title: '要求手动修改卡牌的窗口',
    detail: '用户要求再做一个窗口，能手动修改游戏里的卡牌，重点是数值和效果。',
    effect: 'Manager 开始新增 `/editor` 页面，并让游戏在启动时读取本地保存的卡牌覆盖配置。',
  },
  {
    time: '23:18',
    from: 'User',
    to: 'Manager',
    kind: '新需求',
    title: '要求可视化修改条件机制并修复文本联动',
    detail: '用户指出编辑器仍有漏洞：不能要求直接去 JSON 里改机制，而且上面改了数值后底下文字没有同步；并指定把“背水一击”改为“造成四点伤害，如果你的场上没有随从，再造成四点”。',
    effect: 'Manager 开始把条件触发做成独立字段，修复文字自动同步，并同步校正这张卡的默认机制。',
  },
  {
    time: '23:28',
    from: 'User',
    to: 'Manager',
    kind: '新需求',
    title: '要求扩展条件目标并修复下拉框联动',
    detail: '用户反馈条件奖励改完后描述仍然没同步，希望至少在保存时更新描述；同时要求“条件目标”新增“由玩家决定”和“相同目标”。',
    effect: 'Manager 把编辑器监听扩展为 input + change，并把新增目标选项接入游戏实战结算。',
  },
  {
    time: '23:38',
    from: 'User',
    to: 'Manager',
    kind: '故障反馈',
    title: '指出表单仍会在保存后回退',
    detail: '用户继续反馈：改了条件奖励值后保存，显示文本没有变化，而且条件目标会变回去、条件奖励值会重置为 0，怀疑上面的数值和机制在跟着显示文本反向变化。',
    effect: 'Manager 不再继续用“从效果和文本反推表单”的旧链路，而是把编辑器改成独立的表单模型驱动。',
  },
  {
    time: '23:41',
    from: 'User',
    to: 'Manager',
    kind: '调度请求',
    title: '要求新增 agents 并行修编辑器',
    detail: '用户要求增加几个 agents，分别查“条件奖励值保存后显示文本不更新”的根因，而不是继续单线程修修补补。',
    effect: 'Manager 新增 A1、A2、Reviewer B 三个并行检查位，分别盯保存链、持久化链和风险审查。',
  },
  {
    time: '22:04',
    from: 'User',
    to: 'Manager',
    kind: '新需求',
    title: '要求法术支持目标选择并压缩编辑窗口',
    detail: '用户要求法术不要默认都命中敌方英雄，要能在编辑窗口里配置法术目标；同时希望编辑页整体上下更窄一些。',
    effect: 'Manager 给编辑器增加了法术目标字段，并把游戏里的定向法术改成先选牌再点目标施放。',
  },
];

export const agentRecords = [
  {
    code: 'Manager',
    displayName: 'Manager',
    state: 'active',
    stateLabel: '已整合，等待新任务',
    role: '调度、验收、集成、调试、工作记录维护',
    currentFocus: '修复 `/editor` 的机制编辑漏洞，让条件效果和卡牌文本真正联动。',
    ownedFiles: [
      '/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/server.mjs',
      '/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/app.js',
      '/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/agents.html',
      '/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/agents.css',
      '/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/agents-app.js',
      '/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/agent-worklog.js',
    ],
    assignments: [
      {
        title: '规范普通卡牌的显示规则',
        request: '只有特殊效果才写说明，普通卡只写数值，不要出现建议型文案。',
        actions: [
          '把白板随从在 `public/game-data.js` 里的描述文本清空。',
          '修改 `public/app.js`，让没有特殊效果文本的卡牌不再渲染说明行。',
          '同时让战场上的普通随从卡面不再默认显示“随从”占位文字。',
        ],
        result: '白板卡现在只展示费用、类型和身材数值，特殊效果卡仍然显示效果说明。',
        effect: '卡面信息密度更准确，不会再用解释性文案误导玩家理解卡牌强度。',
      },
      {
        title: '新增手动卡牌编辑器',
        request: '再做一个窗口，让用户手动修改卡牌的数值、文本和效果。',
        actions: [
          '新增 `/editor` 路由和 `editor.html`、`editor.css`、`editor.js` 页面。',
          '新增 `card-overrides.js`，把卡牌覆盖配置存进浏览器 localStorage。',
          '让游戏启动时读取卡牌覆盖配置，并在主界面加入“卡牌编辑器”入口。',
        ],
        result: '你现在可以不改代码，直接在浏览器里调整卡牌名称、费用、身材、文本和效果 JSON。',
        effect: '后续做卡牌平衡或特殊效果测试时，修改速度会比手动改源码快得多。',
      },
      {
        title: '把条件机制从 JSON 挪到可视化字段',
        request: '不要逼用户手改 JSON；像“背水一击”这种条件追加效果，要能在编辑器里直接改。',
        actions: [
          '在 `public/editor.html` 新增条件触发、条件奖励类型、条件目标、条件奖励值字段。',
          '在 `public/editor.js` 里把 `conditional` 效果解析成表单字段，并支持重新生成效果数组。',
          '补上自动文本联动，让上方字段变化时，卡牌描述自动同步。',
          '修复 `public/card-overrides.js`，让新建的自定义卡不只停留在编辑器里，也能真正进游戏。',
        ],
        result: '背水一击这类条件法术现在可以直接在编辑器里改机制，不需要碰底部 JSON。',
        effect: '编辑器从“只能改简单数值的壳”变成了“能改常见机制的真正工作面板”。',
      },
      {
        title: '修复描述不同步并扩展条件目标',
        request: '下拉框变化后描述要更新；条件目标再加“由玩家决定”和“相同目标”。',
        actions: [
          '把 `public/editor.js` 的表单监听从只看 `input` 扩展成同时响应 `input + change`。',
          '为条件效果描述生成器新增“相同目标”和“由玩家决定”两种文案分支。',
          '在 `public/editor.html` 增加这两个条件目标选项。',
          '在 `public/app.js` 里补上这两种目标的运行时处理，让它们不是只存在于编辑器表单里。',
        ],
        result: '现在改条件下拉框时，描述会跟着刷新；保存时也会再次强制同步。',
        effect: '编辑器在桌面和手机浏览器里都更稳定，条件法术的文字和实际结算更一致。',
      },
      {
        title: '重构编辑器数据源，避免保存后字段回退',
        request: '修复“保存后条件目标变回去、条件奖励值归零、描述不同步”的根因。',
        actions: [
          '把 `public/editor.js` 改成用独立的 `editorModel` 作为表单唯一真相。',
          '保存时先把当前表单值写进 `editorModel`，再由它统一生成 `effects` 和 `text`。',
          '渲染编辑器时优先读取 `editorModel`，不再每次从 `effects` 和 `text` 反向推回表单。',
        ],
        result: '条件目标、条件奖励值和显示文本不会再在保存后互相覆盖。',
        effect: '编辑器现在更接近真正的卡牌设计工具，而不是脆弱的字段拼装页。',
      },
      {
        title: '新增并行 agents 做根因排查后再收口修复',
        request: '用户要求增加 agents，分头检查编辑器到底是谁在覆盖谁。',
        actions: [
          '派 A1 检查 `editor.js` 的保存链和回填链。',
          '派 A2 检查 `card-overrides.js` 与 `editor.js` 的持久化链，确认 localStorage 是否丢字段。',
          '派 Reviewer B 审查最近新增的 target 逻辑，找潜在误导点。',
          '最终将法术卡改成强制自动文本同步，并让保存后不再整页回填表单。',
        ],
        result: 'spell 卡的描述现在由上面的机制字段直接驱动，保存时不会再被旧文本反向覆盖。',
        effect: '像“背水一击”这种法术，改条件奖励值后保存，描述会跟机制一起变化。',
      },
      {
        title: '为法术增加目标配置并接入实战',
        request: '法术不要默认都打敌方英雄，要能在编辑器里指定目标；编辑窗口也要更紧凑。',
        actions: [
          '在 `public/editor.html` 增加 `法术目标` 选项。',
          '在 `public/editor.js` 中加入 `damageTarget`，并让法术描述跟目标一起自动变化。',
          '在 `public/app.js` 中加入待施放法术状态，让定向法术先选牌再点英雄或随从。',
          '在 `public/editor.css` 中压缩间距、输入框和按钮高度，让编辑页上下更窄。',
        ],
        result: '像余烬箭这样的伤害法术现在可以配置为打敌方随从、友方随从、英雄，或由玩家决定目标。',
        effect: '编辑器不再只是在写文本，游戏里真正能按你设定的目标进行施法。',
      },
      {
        title: '选定项目底座',
        request: '不要从零写局域网游戏，先找可复用的 LAN 网页骨架。',
        actions: [
          '检查工作区内多个项目的 README、package.json 和服务入口。',
          '确认 `clawteam-lan-snake` 已具备 `0.0.0.0` 监听和局域网访问能力。',
          '基于现有底座新建 `clawteam-lan-hearthstone`，避免污染旧项目。',
        ],
        result: '选中了最适合改造成局域网卡牌游戏的基础项目。',
        effect: '节省了重新处理局域网访问、静态资源和多端打开能力的时间。',
      },
      {
        title: '整合 A/B/C/D 的不一致产物',
        request: '把 worker 结果变成一个真正能跑的游戏，而不是四份分散材料。',
        actions: [
          '识别 A 的逻辑和 B 的 DOM 结构不匹配。',
          '用 C 的数据结构驱动最终版回合逻辑。',
          '把 D 的动画接口嵌入最终版战斗流程，而不是保留成孤立模块。',
        ],
        result: '最终项目目录中的游戏可以直接启动并进入单关 Boss 战。',
        effect: '用户打开项目后看到的是一个整体，而不是拼不起来的半成品。',
      },
      {
        title: '升级工作记录页',
        request: '不要只概括“谁负责哪方面”，而要细致列出新做了什么和效果。',
        actions: [
          '移除游戏页中的 agents 侧栏模块。',
          '新增独立 `/agents` 页面，并给出正式路由。',
          '把状态面板升级为当前状态卡片 + 交互时间线 + 逐 agent 任务明细。',
        ],
        result: '工作记录页已经能展示“谁接了什么、做了哪些动作、产出了什么效果”。',
        effect: '你后续提新需求时，可以更直接地追踪 manager 与各 agent 的动作链路。',
      },
    ],
  },
  {
    code: 'A',
    displayName: 'Agent A',
    state: 'completed',
    stateLabel: '逻辑已交付',
    role: '服务端骨架、前端主逻辑初版',
    currentFocus: '当前待命，等待新的逻辑类修改任务。',
    ownedFiles: [
      '/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/server.mjs',
      '/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/package.json',
      '/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/app.js',
    ],
    assignments: [
      {
        title: '建立新项目目录的可运行骨架',
        request: '先把单关炉石风游戏的服务端和主控逻辑搭起来。',
        actions: [
          '创建了新目录下的 `server.mjs` 和 `package.json`。',
          '创建了 `public/app.js` 初版，开始组织回合、法力、出牌和 Boss 行为。',
          '把玩法方向明确为“单关、Boss 战、浏览器可玩、LAN 可访问”。',
        ],
        result: '项目在目录结构上具备了独立启动的基础。',
        effect: '后续 B/C/D 的产出都有了明确的挂载点，不会继续散落在旧项目中。',
      },
      {
        title: '提供战斗逻辑的第一版模型',
        request: '给页面一个真正的卡牌游戏流程，而不是静态展示。',
        actions: [
          '构建了回合状态、卡牌读取、出牌与攻击流程的初步模型。',
          '引入了 LAN 可访问的服务端思路。',
          '为后续使用 `game-data.js` 和 `animations.js` 预留了入口。',
        ],
        result: '给 manager 提供了可参考的逻辑框架。',
        effect: '虽然最终版被 manager 重写整合，但很多主干概念直接沿用了下来。',
      },
      {
        title: '暴露出真实整合问题',
        request: '尽快形成一个首版逻辑。',
        actions: [
          '按自己的预设写了 UI 选择器和页面结构假设。',
          '这套假设和 B 的最终 HTML 容器没有完全一致。',
        ],
        result: 'manager 在验收阶段准确定位到了前后端接口不一致的问题。',
        effect: '让后续整合改成“显式修复接口”而不是隐性留坑，减少了运行时出错。',
      },
    ],
  },
  {
    code: 'B',
    displayName: 'Agent B',
    state: 'completed',
    stateLabel: '界面已交付',
    role: '响应式 UI、视觉风格、页面容器设计',
    currentFocus: '当前待命，等待新的界面和交互布局修改。',
    ownedFiles: [
      '/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/index.html',
      '/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/styles.css',
    ],
    assignments: [
      {
        title: '构建游戏主界面骨架',
        request: '给单关炉石风游戏搭出完整前端壳子，兼顾手机和桌面。',
        actions: [
          '切出敌方英雄区、战场区、玩家英雄区、手牌区、按钮区、LAN 区、日志区和提示区。',
          '用稳定的 id/class 组织了各个功能区域，方便后续逻辑接线。',
          '把界面结构保持在单页中，减少手机端跳转成本。',
        ],
        result: '逻辑接线点足够完整，manager 可以直接把真实玩法接进来。',
        effect: '用户现在进入游戏页时，不会看到原始开发界面，而是一个完整的卡牌桌布局。',
      },
      {
        title: '做桌面和手机的双端布局',
        request: '电脑和手机都要能玩，不只是缩放同一份页面。',
        actions: [
          '桌面上保留大面积战场和侧栏信息区。',
          '手机上改成更紧凑的单列/窄列布局。',
          '让手牌支持横向滚动，按钮尺寸更适合拇指点击。',
        ],
        result: '页面不会在手机上因为手牌过宽或按钮太小而难以操作。',
        effect: '同一局域网里，电脑和手机都可以直接打开并进行当前版本的游玩。',
      },
      {
        title: '给页面建立明确的视觉语言',
        request: '做出“炉石感”，但不要直接照搬素材。',
        actions: [
          '使用木纹、金属边框、暖金色高光和法术色渐变建立酒馆氛围。',
          '强化了面板边框、战场纹理和手牌视觉层次。',
          '为信息区和按钮区做了不同的背景分层，减少视觉混乱。',
        ],
        result: '页面从“普通网页”变成了更接近卡牌对战桌面的视觉风格。',
        effect: '当前版本虽然动画不重，但静态界面已经有较明显的题材辨识度。',
      },
    ],
  },
  {
    code: 'C',
    displayName: 'Agent C',
    state: 'completed',
    stateLabel: '数据已交付',
    role: '卡牌设计、Boss 规则、单关脚本',
    currentFocus: '当前待命，等待新的卡牌平衡、Boss 或关卡修改。',
    ownedFiles: [
      '/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/game-data.js',
    ],
    assignments: [
      {
        title: '清理普通卡牌文案',
        request: '把没有特殊效果的卡牌从“有说明文本”改成“只保留数值”。',
        actions: [
          '把 `酒馆新兵`、`战旗骑士`、`炉卫` 的 `text` 置空。',
          '保留这些卡的费用、攻击和生命值不变。',
          '不动真正有特殊效果的法术卡文案。',
        ],
        result: '白板卡的数据语义更干净，特殊效果和普通数值卡之间的边界更明确。',
        effect: '前端在读取卡牌数据时，可以直接根据是否有文本决定是否显示效果说明。',
      },
      {
        title: '设计当前这关的卡牌池',
        request: '做一个规模不大但真的能玩的单关卡牌集合。',
        actions: [
          '设计了 10 张卡，覆盖伤害、治疗、护甲、召唤、增益、抽牌等基础类型。',
          '控制复杂度，不引入过深的连锁机制或多目标结算。',
          '用结构化 JS 导出卡牌信息，方便主逻辑读取。',
        ],
        result: '游戏不再是空逻辑，而是有明确可打出的手牌和策略选择。',
        effect: '当前这关的玩家侧玩法已经具备基础卡牌对战手感。',
      },
      {
        title: '设计单关 Boss 与目标',
        request: '只做一关，但要让它像一场完整的 Boss 战。',
        actions: [
          '设计了 Boss「寒炉督战者·柯沃」及其护甲、技能与回合脚本。',
          '给出前期稳场、中期压血、后期清场与终结的压力节奏。',
          '定义了第 12 回合前击败 Boss 的单关目标。',
        ],
        result: '关卡拥有明确压力曲线，而不是随机动作的假 Boss。',
        effect: '玩家现在会感受到“要在有限回合内赢”的单关节奏压力。',
      },
      {
        title: '纠正路径错误并进入正式项目',
        request: '把数据模块放进最终项目目录，供 app.js 使用。',
        actions: [
          '第一次误写到旧目录后，按 manager 要求重新写入新项目目录。',
          '保留导出结构，让 manager 能直接导入 `encounter`、`starterDeck`、`rulesText` 等信息。',
        ],
        result: '数据文件被纳入最终项目，而不是停留在无关旧目录。',
        effect: 'manager 后续整合时没有被旧文件误导，正式游戏使用的是正确版本的数据。',
      },
    ],
  },
  {
    code: 'D',
    displayName: 'Agent D',
    state: 'standby',
    stateLabel: '轻量动画可继续扩展',
    role: '动画反馈、交互增强、优雅降级',
    currentFocus: '等待你决定是否继续加重型出牌特效、镜头感或更复杂的反馈。',
    ownedFiles: [
      '/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/animations.js',
    ],
    assignments: [
      {
        title: '建立独立动画模块',
        request: '不要让动画和主逻辑强耦合，要能单独接入和替换。',
        actions: [
          '把动画封装成 `createAnimator(...)` 和一组简洁接口。',
          '避免依赖第三方库，优先使用原生 Web Animations API。',
          '同时兼顾 `module.exports` 和浏览器全局对象的访问方式。',
        ],
        result: '动画层可以被 manager 直接插入主逻辑，不需要继续拆解内部实现。',
        effect: '当前游戏里的动画反馈都来自统一入口，后续替换或增强会更容易。',
      },
      {
        title: '覆盖战斗中的高价值反馈点',
        request: '先保证关键动作有反馈，再谈复杂视觉演出。',
        actions: [
          '实现抽牌、受击、治疗、出牌飞出、回合横幅、胜利和失败提示。',
          '让这些反馈在不同浏览器能力下都尽量可用。',
        ],
        result: '当前版本不会完全“静止”，关键动作有最基础的视觉回应。',
        effect: '玩家更容易理解伤害、回合切换和胜负变化，而不是只看数字跳变。',
      },
      {
        title: '明确边界并做降级策略',
        request: '如果做不到重型动画，要明确告诉用户并保证游戏仍能玩。',
        actions: [
          '主动选择轻量路线，没有盲目堆复杂粒子和大段脚本。',
          '为低能力环境保留 class/样式降级方案。',
        ],
        result: '动画不是炉石级大制作，但稳定、清晰、不会成为项目阻塞点。',
        effect: '当前版本适合先迭代玩法和细节，后面如果你要更重的视觉效果，再把任务继续派给 D。',
      },
    ],
  },
];

export const rawAgentLogs = [
  {
    id: 'raw-user-editor-fix-request',
    agent: 'User',
    kind: 'raw_user_request',
    title: 'Raw User Request: 背水一击与编辑器漏洞',
    body: `把背水一击 改成 造成四点伤害,如果你的场上没有随从,再造成四点。 你看,你修改的这个面板还是有漏洞。我不可能直接去往Json里面改这些东西；而且我改了上面的数值,底下的文字也没有改啊,这都是问题,要修改一下。 就比如这个背水一击,要把机制的修改添加进去。`,
  },
  {
    id: 'raw-manager-editor-fix-action',
    agent: 'Manager',
    kind: 'raw_manager_action',
    title: 'Raw Manager Action: 条件机制字段化',
    body: `执行修复：
- 将 背水一击 默认机制固定为：造成 4 点伤害；如果你的场上没有随从，再造成 4 点。
- 在 /editor 增加条件触发、条件奖励类型、条件目标、条件奖励值字段。
- 上方字段变化时自动重建 effects，并同步刷新文本区。
- 仅复杂机制才继续使用额外效果 JSON。
- 修复自定义卡只保存在编辑器、不进入游戏的问题。`,
  },
  {
    id: 'dispatch-a',
    agent: 'A',
    kind: 'manager_prompt',
    title: 'Raw Dispatch To A',
    body: `你是 A，负责“代码与联机骨架”。任务目标：在 /Users/ruiliu/Documents/New project 下新增或改造一个 LAN 可访问的单关炉石风网页游戏，优先复用现有 clawteam-lan-snake 的思路，但你的写入范围只限这些文件：
- /Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/server.mjs
- /Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/package.json
- /Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/app.js

要求：
- 你不是一个人在代码库里，其他 worker 也会同时工作；不要回退别人的改动，要兼容他们的文件。
- 做单关、炉石风、可在电脑和手机浏览器玩的游戏。
- LAN 重点：服务监听 0.0.0.0，提供本机/局域网访问地址展示，任何同局域网设备都能打开页面试玩。
- 玩法可简化为单人对战一个 Boss 的“炉石 inspired”回合制卡牌战斗，不要追求完整炉石规则。
- app.js 要作为主控层，能导入 C 和 D 产出的模块：
  - /Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/game-data.js
  - /Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/animations.js
- 如果你需要定义这些模块的接口，请直接在 app.js 中按合理方式导入使用，但不要修改它们的文件。
- 需要有清晰的 turn flow、mana、hand、play card、end turn、enemy turn、win/lose/restart。
- 输出时请总结你做了什么，并列出你改过的文件路径。`,
  },
  {
    id: 'dispatch-b',
    agent: 'B',
    kind: 'manager_prompt',
    title: 'Raw Dispatch To B',
    body: `你是 B，负责 UI。任务目标：为一个单关炉石风 LAN 网页游戏设计并实现结构与响应式界面。你的写入范围只限这些文件：
- /Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/index.html
- /Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/styles.css

要求：
- 你不是一个人在代码库里，其他 worker 也会同时工作；不要回退别人的改动，要兼容他们的文件。
- 页面需要桌面和手机都好用。
- 整体风格要有“炉石感”，但不要直接照搬素材；用 HTML/CSS 做有质感的酒馆/木纹/金属/魔法界面氛围。
- 需要给 app.js 留出这些 id/class 钩子，确保 JS 容易接线：hero title、状态栏、LAN 地址区、玩家英雄区、敌方英雄区、手牌区、战场区、日志区、按钮区、提示区、重新开始按钮、结束回合按钮。
- 如果你愿意，可以补充更多语义化容器和 data 属性，但不要写业务 JS。
- 请把移动端手牌、按钮、日志、状态区布局处理好。
- 输出时请总结你做了什么，并列出你改过的文件路径。`,
  },
  {
    id: 'dispatch-c',
    agent: 'C',
    kind: 'manager_prompt',
    title: 'Raw Dispatch To C',
    body: `你是 C，负责卡牌设计与单关规则数据。你的写入范围只限这个文件：
- /Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/game-data.js

要求：
- 你不是一个人在代码库里，其他 worker 也会同时工作；不要回退别人的改动，要兼容他们的文件。
- 设计一个“只有一关”的炉石 inspired 战斗数据模块，适合单人对战一个 Boss。
- 用原生 JS 导出结构化数据，供 app.js 导入。
- 目标内容：玩家初始牌组/卡池、Boss 名称与技能、回合脚本或 AI 倾向、卡牌文案、伤害/治疗/护甲/召唤等简化效果。
- 规模控制在可玩但不复杂：建议 8-12 张牌，2-4 类效果，1 个 Boss，1 套单关目标。
- 同时导出一段简短规则说明文本，方便 UI 展示。
- 保持接口直观，例如 export const encounter = ... / cards = ... / starterDeck = ...，由 app.js 易于使用。
- 输出时请总结你做了什么，并列出你改过的文件路径。`,
  },
  {
    id: 'dispatch-d',
    agent: 'D',
    kind: 'manager_prompt',
    title: 'Raw Dispatch To D',
    body: `你是 D，负责动画层。你的写入范围只限这个文件：
- /Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/animations.js

要求：
- 你不是一个人在代码库里，其他 worker 也会同时工作；不要回退别人的改动，要兼容他们的文件。
- 为单关炉石风网页游戏提供轻量动画与反馈工具，供 app.js 导入调用。
- 不要依赖第三方库；用原生 JS + DOM/CSS class 切换或 Web Animations API。
- 动画目标：抽牌、出牌、受击、治疗、回合切换、胜利/失败提示。能做轻量版即可，不要求电影级。
- 请把接口设计得简单，例如 createAnimator(...) / pulseStat(...) / flingCard(...) / flashMessage(...) 之类。
- 如果受限于当前项目结构，请提供优雅降级，让游戏没动画也能正常玩。
- 输出时请总结你做了什么，并列出你改过的文件路径。`,
  },
  {
    id: 'raw-c-completion-old-path',
    agent: 'C',
    kind: 'completion',
    title: 'Raw Completion From C (old path)',
    body: `我已经把这套“只有一关”的炉石风单人 Boss 战数据写进了 \`public/game-data.js\`，并且做过最小导入校验，确认 \`cards / starterDeck / cardPool / encounter / rulesText / cardById\` 都能正常导出。

这份数据里包含了 10 张原创卡牌、12 张起始牌组配置、1 个 Boss「寒炉督战者·柯沃」、Boss 的技能/AI 倾向/回合脚本，以及一段可以直接给 UI 展示的规则说明。为了方便后面的 \`app.js\` 接线，我也把卡池和初始牌组分开了。

改动文件：
- \`/Users/ruiliu/Documents/New project/clawteam-lan-snake/public/game-data.js\`

如果你愿意，我下一步可以继续帮你把 \`app.js\` 接上这个数据结构，或者让 B / D worker 分别接 UI 和动画。`,
  },
  {
    id: 'raw-c-correction',
    agent: 'Manager->C',
    kind: 'manager_message',
    title: 'Raw Correction To C',
    body: `路径需要纠正：请把你刚才写的同一份数据模块放到 /Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/game-data.js。不要再改旧的 snake 目录文件，也不要删除任何现有文件。写完后只回复新路径。`,
  },
  {
    id: 'raw-c-completion-new-path',
    agent: 'C',
    kind: 'completion',
    title: 'Raw Completion From C (corrected path)',
    body: `/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/game-data.js`,
  },
  {
    id: 'raw-d-completion',
    agent: 'D',
    kind: 'completion',
    title: 'Raw Completion From D',
    body: `已经把动画层做成了一个自包含的轻量模块，放在 [animations.js](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/animations.js:1) 里。它提供了 \`createAnimator(...)\`、\`pulseStat(...)\`、\`flingCard(...)\`、\`flashMessage(...)\`、\`hit(...)\`、\`heal(...)\`、\`drawCard(...)\`、\`turnBanner(...)\`、\`victory(...)\`、\`defeat(...)\` 这些接口，优先用原生 Web Animations API，不支持时会优雅降级为 class / CSS 级反馈，不会影响游戏继续运行。

我还做了一个语法自检，文件可以正常解析。  
改过的文件路径：
- \`/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone/public/animations.js\``,
  },
  {
    id: 'raw-b-completion',
    agent: 'B',
    kind: 'completion',
    title: 'Raw Completion From B',
    body: `我把这套 LAN 炉石风界面骨架做好了：\`index.html\` 里已经挂好你要的 \`hero title\`、\`status-bar\`、\`lan-address\`、\`enemy/player hero\`、\`battlefield\`、\`hand\`、\`log\`、\`button\`、\`hint\` 这些接线点；\`styles.css\` 里补了酒馆木纹、金属边框、魔法氛围的视觉层，以及桌面分栏、手机单列、手牌横滑、按钮和日志的响应式处理。

动画这部分我只做了轻量的 CSS 氛围动效，没有上 JS 驱动的卡牌战斗动画，所以界面骨架是完整的，但真正的出牌、回合和特效还要等 A 的逻辑接上。

改动文件：
- [clawteam-lan-hearthstone/public/index.html](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/index.html)
- [clawteam-lan-hearthstone/public/styles.css](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/public/styles.css)`,
  },
  {
    id: 'raw-a-close-status',
    agent: 'A',
    kind: 'status_event',
    title: 'Raw Status Event For A',
    body: `shutdown`,
  },
  {
    id: 'raw-a-note',
    agent: 'A',
    kind: 'availability',
    title: 'Raw Availability Note For A',
    body: `NO_RAW_LOG_AVAILABLE`,
  },
  {
    id: 'raw-user-editor-request',
    agent: 'User',
    kind: 'request',
    title: 'Raw User Request For Editor',
    body: `请再做一个窗口，让我可以手动修改 游戏，主要是 卡牌（数值，效果等）`,
  },
];
