# README 历史快照（不代表当前状态）

# 墨墨星球 MVP

S3验证修复：已读取本机29项测试报告，其中28项通过，1项迁移副本清理遇到Windows文件锁。备份连接已改为显式关闭，并增加连接释放断言；请重新运行 `.venv\Scripts\python.exe verify-s3.py`。修复后的后端尚未复验，不进入S4。

当前S3已进入验证：持续额度、去重账本、单活跃页、进度恢复、持久重试队列和PIN校验服务已实现，见 [S3交付记录](docs/S3_DELIVERY.md)。前端20项新检查与S2的25项回归通过；新后端29项隔离测试需本机运行 `.venv\Scripts\python.exe verify-s3.py`。通过后重启旧服务，再硬刷新页面；启动会先做副本验证与备份。尚未标记S3通过，不进入S4。

S2已按用户验收确认通过：主页面已迁移至独立四模块和JSON内容包，详见 [S2交付记录](docs/S2_DELIVERY.md)。S3继续沿用该结构和手绘风格；内部整理仅在 http://127.0.0.1:8765/?dev=tidy 使用隔离内存。S2回归命令仍为 `node check-s2.mjs`（25项）与 `node validate-s2-content.cjs`。

## 页面风格与后续开发

项目统一采用温暖的手绘绘本风格，覆盖首页及所有内页。后续界面开发先阅读 [页面风格规范](DESIGN_SYSTEM.md) 和 [开发约定](AGENTS.md)，复用共享样式与 SVG 插画；新增情景、页面及交互状态均须延续此基线。风格决策与验证情况记录在规范末尾。

实施进度见 [实施计划](IMPLEMENTATION_PLAN.md)、[S0 缺口核查](docs/BASELINE_AUDIT.md) 和 [S1 契约草案](docs/INTERACTION_CONTRACT.md)。统一检查入口为项目目录的 `node check.cjs`，也可从父目录执行 `node momoplanet/check.cjs`；检查自行固定工作目录并生成 `reports/checks-latest.json`，无法访问 Python 会明确报阻断。旧行为检查通过不代表 PRD v1.8 验收通过。

S1 双情景交互原型：启动本地服务后打开 http://127.0.0.1:8765/dev/ 。包含野餐与内部玩具整理、预选试听后确认、两步收纳与保存失败重试；只用本页内存，不写家庭记录、不扣额度。开发内容检查 `node validate-content.cjs`，原型模型检查 `node check-prototype.cjs`；严格发布检查 `node validate-content.cjs --release` 目前会因草稿和本地音频缺失而失败。[S1 交付记录](docs/S1_DELIVERY.md) 列出实现范围和未完成验收。

按阶段验证见 [阶段验证记录](docs/STAGE_VERIFICATION.md)。S0 本机环境采集页为 http://127.0.0.1:8765/dev/baseline.html ；`node stage-gates.cjs` 检查环境与自动检查证据，未通过返回非零。后端未改动且工具无法访问Python时，统一检查可明确标注复用用户本机3项通过证据；源码哈希不符则不能复用。

S0、S1已通过：10项样音技术检查通过，用户已确认S1完成并授权进入S2，证据见 `reports/s1-user-confirmed.json`；不把用户确认写成助手实际听感审阅。S1原型仍保留对照，样音来源清单的正式分发审阅与全部音频在S4处理。[样音生成和验证步骤](docs/S1_AUDIO.md)；S2阶段门槛命令为 `node stage-gates.cjs --stage S2`。

S1项目审阅页面：http://127.0.0.1:8765/dev/review.html 。先生成样音并运行 `node check.cjs`，再实际试听/审阅；可导出包含源码与样音指纹的记录。未齐全或未实际审阅不能通过阶段门槛。完整流程规格见 [S1_FLOW_SPEC.md](docs/S1_FLOW_SPEC.md)。

> 产品与验收以 [PRD v1.8 · 产品决策与交付基线版](../MomoPlanet-墨墨星球-PRD-v1.8-产品决策与交付基线版.md) 为准。旧颜色课程已移出当前版本。

产品核心为主题小故事、情景对话、游戏互动、单词汇总四模块，情景可持续扩展。野餐是首个验证情景，词量、故事段数、对话轮数与装篮子玩法均不构成产品上限。情景内容契约、内部玩具整理样例及第二种最小交互为待实现验证要求，本轮完整发布内容仍只有野餐。v1.8 明确预听后确认、持续单段额度、按情景与模块恢复；复习、观察补注、可调语速为 P1。实施顺序以 S0–S6 为准。

当前首页已升级为“和 Momo 去野餐”主题：主题小故事、情景对话、游戏互动和单词汇总。核心词为 apple、banana、bread、milk。每个环节可独立进入，也可按顺序体验；取消每日一个新词和固定可玩时段限制，保留时长上限。

新版页面入口是 `static/theme.js`，旧 red 原型文件保留用于追溯。音频优先使用 `static/audio/<单词>.wav`，缺失时使用设备英语语音；中文故事和英文对话使用设备对应语音。系统语音可能依赖网络，尚未验证全离线能力。所有游戏选择均记作练习，不输出掌握或独立识别结论。

运行 `node check-theme.cjs` 可验证页面渲染、游戏结果、切换和退出记录；该检查不替代浏览器中的声音及视觉验收。

上述命令及后端测试均须在项目目录执行。Windows 命令提示符（CMD）完整命令：

```bat
cd /d D:\py_space\momoplanet
node check-theme.cjs
node check-timing.cjs
python -m unittest discover -s tests -v
```

PowerShell 使用 `Set-Location D:\py_space\momoplanet` 切换目录。本项目后端测试为 `tests/test_storage.py` 中的 3 项内存 SQLite 测试，不需要 pytest 或 API key；如果发现搜索 API 等第三方测试，请先检查工作目录。

Python 3.10+，仅使用标准库，无需 pip 安装。所有数据保存在本项目 data.sqlite3。

## 使用虚拟环境运行

在本目录执行：

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe app.py
```

或者运行 `powershell -ExecutionPolicy Bypass -File .\start.ps1`。
打开 http://127.0.0.1:8765 。服务仅监听本机。

## 本地音频

词音优先读取 `static/audio/apple.wav`、`banana.wav`、`bread.wav`、`milk.wav`，缺失时尝试设备英语语音。故事、对话和中文释义使用系统对应语音，可能依赖网络，全离线能力尚未验收。

## 当前范围

2026-10-30更新：开发体验模式取消时长限制，继续记录实际用时和进度；修改后请重启服务并强制刷新Chrome。正式模式仍保留原限时。S5发布核验工具已交付，运行 `node s5-release.cjs` 后打开 `/dev/s5-review.html` 记录实机矩阵与自愿家庭观察；详见 [S5交付](docs/S5_DELIVERY.md)。当前未通过正式发布验收，下文保留此前范围记录。

首页、四幕英语故事、四轮分支对话、听词装篮子、四词汇总、提示、跳过、退出、野餐唯一参与贴纸、SQLite 事件与体验记录、默认单次 8 分钟及每日 15 分钟。

待补齐家长设置、PIN、单次到点后再次开始确认、贴纸计时、跨日及多页面计时、体验恢复、语音操作指引、本地音频与数据管理；可选旧词复习为 P1。结束页需按真实获贴状态展示。Momo 与主要学习对象当前使用统一的手绘 SVG 表现。自定义词卡、图音配对、更多主题不在本轮范围。

重启后本地服务接口此前已确认可访问。2026-10-29 用户在本机 CMD 确认项目 `.venv` 为 Python 3.12.4，执行 `.venv\Scripts\python.exe -m unittest discover -s tests -v`，3 项内存 SQLite 测试全部通过。此前工具环境无法访问基础 Python 目录，不能据此认定用户的 Python 安装失效。两项前端 VM 检查 `node check-theme.cjs`、`node check-timing.cjs` 已通过其覆盖流程。真实浏览器音画、断网、跨日及重启仍待验收；测试不得覆盖家庭真实数据库。详见实施计划中的 S0 实测记录。

S7 已实现跨情景旧词复习接入，修复复习区中文文案，使用来源情景图音并隔离内部样例。运行 
ode check-s7.mjs 验证；当前无第二个发布情景，Chrome布局与听感仍待验。详见 [S7交付](docs/S7_DELIVERY.md)。
