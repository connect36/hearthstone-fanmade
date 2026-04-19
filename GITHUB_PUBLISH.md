# 炉边酒馆 · GitHub 发布说明

## 项目根目录

- `/Users/ruiliu/Documents/New project/clawteam-lan-hearthstone`

## 当前状态

为了发布到 GitHub，这一轮已经完成：

- 重写 [README.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/README.md:1)
- 更新 [AI_PROCESS.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/AI_PROCESS.md:1)
- 更新 [AI_CONCLUSION.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/AI_CONCLUSION.md:1)
- 更新 [AI_DEV_GUIDE.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/AI_DEV_GUIDE.md:1)
- 补充 [.gitignore](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/.gitignore:1)
- 已在项目目录初始化独立本地 git 仓库

也就是说：

- 项目说明已经补齐
- AI 交接文档已经拆分清楚
- 仓库忽略文件已经具备基础配置
- 当前目录已经可以独立提交，不再依赖外层混合工作区

## 当前阻塞点

这一台机器上，当前阻塞 GitHub 真正上传的关键点有两个：

### 1. 没有 `gh`

本机检查结果是：

```bash
gh --version
# zsh: command not found: gh
```

### 2. 项目还没有连接到一个 GitHub 远端仓库

当前这个项目目录已经是独立本地 git 仓库，但还没有配置一个可直接推送的 GitHub `origin`。

## 为什么这会阻塞“直接上传”

要把本地代码完整发到 GitHub，通常至少要满足下面其中一种：

1. 本地已经有独立 git 仓库，并且配置好了 `origin`
2. 本机装好 `gh`，能用 CLI 创建仓库并推送
3. 用户已经在 GitHub 上建好了空仓库，并把远端地址提供给当前目录

当前环境还缺的正是：

- `gh`
- 现成的 GitHub 远端 `origin`

## 最短完成路径

如果继续由人或另一个 AI 完成上传，最短路径是：

### 路径 A：用户先在 GitHub 上建空仓库

例如新建：

- `connect36/clawteam-lan-hearthstone`

然后在本地项目目录执行：

```bash
git add .
git commit -m "initial import"
git remote add origin <你的 GitHub 仓库地址>
git push -u origin main
```

### 路径 B：先安装并登录 `gh`

```bash
brew install gh
gh auth login
```

然后再在项目目录中执行仓库创建与推送。

## 建议的仓库名

建议 GitHub 仓库名使用：

- `clawteam-lan-hearthstone`

## 建议上传范围

建议上传：

- 所有源码
- `README.md`
- `AI_PROCESS.md`
- `AI_CONCLUSION.md`
- `AI_DEV_GUIDE.md`
- `AI_HANDOFF.md`
- `GITHUB_PUBLISH.md`
- `package.json`
- `package-lock.json`

不建议上传：

- `node_modules/`
- 本地临时文件
- `.DS_Store`

## 上传后建议检查

上传完成后建议在 GitHub 仓库首页确认：

- README 是否正确显示
- 文档链接是否可读
- `package.json` 是否存在
- `public/` 与 `server/` 目录是否完整
- `.gitignore` 是否生效

## 给下一个接手者的提醒

如果你是后续接手发布的人，先读：

1. [README.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/README.md:1)
2. [AI_CONCLUSION.md](/Users/ruiliu/Documents/New%20project/clawteam-lan-hearthstone/AI_CONCLUSION.md:1)
3. 这个文件

这样可以最快知道：

- 现在这套项目包含什么
- 当前哪些功能已经稳定
- 为什么还没真正推上 GitHub
