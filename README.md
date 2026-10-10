# 花砖物语（Azul）

2–4 人的花砖拼墙桌游，网页联机版。规则按《花砖物语：规则与实现规格》实现；名字、美术和规则说明文字都是自己的。

线上地址：<https://gulugagame.com/azul/>

## 本地运行

```bash
npm install
npm run dev          # 服务端 :3006，网页 :5179
npm test             # 规则引擎（规格书 16 个用例 + 300 局随机模拟）、人机、教程剧本、服务器
npm run typecheck
```

一个人测试：`node scripts/test-bot.mjs host 2 1` 会让机器人建一个 2 人房、拉一个机器人进来并打印房间码，你在网页里用房间码加入凑满 2 人后自动开局。机器人轮到自己时随机挑一个合法行动（调 `legalActions`）。`BOT_DELAY_MS` 调思考时间，`BOT_IDLE=1` 只挂着不动。

## 目录

| 路径 | 内容 |
|---|---|
| `packages/game/src/engine.ts` | 规则引擎：`apply(state, playerId, command, rng) → { state, events }`，纯函数；开局、拿砖（工厂/中心区）、放砖（图案行/地板行）、铺墙计分、地板扣分、终局奖励、按玩家视角隐藏信息 |
| `packages/game/src/types.ts` | 状态、行动、事件的类型（基本照规格书的参考结构） |
| `apps/server` | Socket.IO 房间、断线用原昵称回到座位、60 秒回合计时（超时自动选损失最小的放法）、语音信令、每局的种子和动作序列写进 `logs/games.jsonl` |
| `apps/web/src/GameBoard.tsx` | 对局界面：工厂与中心区、玩家棋盘（图案行 + 5×5 墙 + 地板行）、先选颜色再选目标、动作记录、结算弹窗 |
| `art/` | PixelLab 美术流水线（见下） |

## 新手教程

做法和全站一样（剧本局 + 练习局和提示 + 第一次小贴士，咕噜嘎当向导），见 `~/projects/pipeline/handbook/tutorial-notes.md`。

- 入口：首页简介下面的邀请卡，等候房间规则面板下面也有（在等候房间里看教程不离开房间，房主一开局就自动回到牌桌）。地址带 `?tutorial` 直接打开。学过或跳过以后只剩「再看一遍」小按钮（本机 `gm-tutorial-azul`）。
- 剧本 `packages/game/src/tutorial.ts`（18 步）：两人局后半段的固定局面（第 4 轮，这一轮已经拿过几手），你和咕噜一号各走 3 手就拿完这一轮的砖。依次教：目标、工厂、从工厂拿一种颜色（剩下的进中心区）、图案行规则、从中心区拿砖和起始标记、放不下掉地板、铺墙横竖相连计分（8 分那块和只得 1 分那块）、地板扣分、咕噜一号铺满一整横行游戏结束、终局奖励（你铺满第 3 列 +7，赢 38 比 32）。这一局用不到随机数，剧情一定这样发生；单测 `tutorial.test.ts` 检查每一步合法、锚点看得见、关键几幕的分数，以及练习局人机对打 200 局都能结束。
- 网页：共用教练层 `apps/web/src/tutorial/`（从欲罢不能原样复制），本游戏的部分是 `TutorialMode.tsx`（假房间、侧栏教程进度）和 `tutorialGame.ts`（「提示」的说法、小贴士）。GameBoard 多了 `selfMemberId`、`mode`、`finalActions`、`finalHidden`、`onSelection` 几个可选属性；要高亮的元素带 `data-tutorial`（`supply`、`center`、`factory:<下标>`、`board|lines|wall|floor:<玩家>`、`line:<玩家>:<行>`、`wall-row:<玩家>:<行>`、`wall:<玩家>:<行>:<列>`、`final:<玩家>`、`hint`、`cancel-auto`、`players`）。
- 练习局：剧本走完点「开一局练习」，新开一局和咕噜一号（人机）的两人局；「提示」按钮在提示条上（键盘 H），让人机从你的位置算一步并说原因。只有自己和人机的房间里也有「提示」，有别的真人就没有。
- 第一次小贴士（只在真实对局里出，每条每台机器一次）：拿到起始标记、放不下掉地板、第一次铺墙计分、第一次地板扣分、有人一横行只差一块。
- 走查脚本：`node ~/projects/qa-reports/tools/tut-azul.mjs <输出目录> flow|waiting|room [1440|1920|1024|390] [night|day]`（先 `npm run dev`；`SHORT=1` 只走到练习局开头）。

## 规格书没写死、这里这样处理的地方

规格书里标「配置项」的全部用默认值（2–4 人、每种颜色 20 块、地板扣分 -1/-1/-2/-2/-2/-3/-3、终局奖励横排 +2 / 竖列 +7 / 集齐五色 +10、回合 60 秒、并列都算赢）。另外：

| # | 问题 | 处理 |
|---|---|---|
| 1 | 工厂圆盘的数量 | 玩家数 2/3/4 时分别用 5/7/9 个工厂（标准 Azul 的厂商配置） |
| 2 | 终局触发 | 有人铺满一整行墙即触发（标准规则），不是拿完某个颜色 |
| 3 | 分数不出现负数 | 地板扣分后分数下限取 0 |
| 4 | 随机数 | 种子由服务器的安全随机数生成；种子、随机数状态和动作序列不发给客户端 |
| 5 | 人机 | 房主在等待时点空座位上的「加人机」（咕噜一号 / 二号 / 三号，普通难度）；一个人加满人机也能开局，人机总是同意再来一局。策略在 `packages/game/src/bot.ts`：一步贪心，填满图案行按上墙得分 + 终局奖励进度算、没填满按比例折算、进地板按扣分表扣。模拟对局 2 人局平均约 62 分，对「溢出最少」的超时自动打法胜率约 98% |
| 6 | 托管 | 连续超时 2 次转托管，由人机代打；自己动一下或点「取消托管」就交还。离线的人轮到时先等 3 秒，再由人机代打（不算超时）；用原昵称回来就交还 |

## 美术流水线（`art/`）

PixelLab API，密钥只在 `~/.config/pixellab/api_key`，不进仓库。每次调用记进 `art/ledger.jsonl`，`BUDGET_USD` 设上限。生成的原图和中间文件在被 gitignore 的 `art/out/`。

- `generate_azul.py`：五种花砖、起始玩家标记、首页主图，每种出两个候选 `-c1`/`-c2` 到 `art/out/candidates/`；挑好后复制成 `apps/web/public/art/` 下的正式文件名（`tiles/<颜色>.png`、`ui/marker.png`、`ui/hero.png`）。`public` 里只放正式文件。
- `pixellab.py`：PixelLab API 客户端（`/create-image-pixflux`），调用即记进 ledger。

## 画面：白天版和夜间版

只有像素风一种画面（原始版本已删掉），配色分夜间（深色，默认）和白天（白底）两种。顶栏「切换白天版 / 切换夜间版」随时切换，只影响自己看到的画面，记在浏览器的 `gm-pixel-theme` 里；gulugagame.com 上的大厅和各个游戏同源，共用这一个选择。

- 夜间配色就是 `app-pixel.css`（首页和等候房间）和 `azul.css`（牌桌）本身。白天版不单独写：`apps/web/day-theme.ts`（Vite 插件）在构建时把这些样式里和颜色有关的声明照抄一份，选择器前加 `:root[data-theme="day"]`，按 `apps/web/day-palette.ts` 的调色表换成白天的颜色。改夜间样式时白天版自动跟着变，只有新出现的深色需要在调色表里补一行。
- 机械换色不合适的地方在 `apps/web/src/theme-day.css` 里手写。
- `index.html` 里一小段脚本在样式生效前就给 `<html>` 加上 `data-theme="day"`，打开页面不会先闪一下深色；切换逻辑和按钮在 `src/theme.tsx`。

## 部署

服务器上 `~/azul`，pm2 进程 `azul`（端口 3006），网页在 `/var/www/azul`，Caddy `handle_path /azul/*`。本机运行 `~/projects/deploy.sh azul`（服务器拉 GitHub 上的 main）。

## 服务器上的启动方式

pm2 按仓库根目录的 `ecosystem.config.cjs` 直接启动一个 `node --import tsx` 进程跑服务端（不经过 `npm start`）。端口和密钥存在 pm2 里，不进仓库；`deploy.sh` 照旧 `pm2 restart`。改了 `ecosystem.config.cjs` 之后，要在服务器上带着原来的环境变量 `pm2 delete` 再 `pm2 start ecosystem.config.cjs` 一次。
