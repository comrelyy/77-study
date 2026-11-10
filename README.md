# 墨墨星球 MomoPlanet

面向家长陪伴下 3–6 岁儿童的英语情景体验。本地 Python 服务、HTML/CSS/JavaScript 和 SQLite；包含故事、角色对话、游戏、词卡四模块。

## 当前状态（2026-11-03）

以 [十二主题故事与玩法调整](docs/CONTENT_V2.md) 及当前 reports 为准；阶段文档保留历史，不代表最新运行结果。

最新交互见 [情景互动与故事播放修复](docs/INTERACTION_INTEGRATION.md)：对话与小游戏合并为“情景互动”，点回答直接接话，移除二次确认；故事重听立即朗读本幕。

强制刷新误报“另一个页面正在使用”已修复：刷新安全交接活动凭据，卸载立即释放，遗留租约自动恢复，真实多页仍互斥。原因和测试边界见 [刷新恢复修复](docs/RELOAD_HANDOVER_FIX.md)。

最新主题首页为“一节课一条线”：只有“开始这节课”一个入口，题目源在 `content-lesson/`，题目需人工审核。行为、数据格式、审核与读音流程、验证结果和未做的实机验收见 [一节课一条线](docs/LESSON_LINE.md)。

- 当前入口为 `static/main.mjs`，公共逻辑在 `static/core/`，模块在 `static/modules/`，内容包在 `static/content/`。旧 `theme.js`、`dialogue.js` 仅供历史回归。
- 根地址为「Momo 的一天」地图，13 个关卡（含开发预览中的穿衣、洗漱、早餐、做点心、整理、野餐、公园、乘车、购物、天气、种植、睡前等主题）按顺序逐关解锁；内部整理入口 `/?dev=tidy` 继续使用隔离内存。正式发布清单为空。
- 当前内容为 37 个不同目标词、72 幕含角色交流的故事、74 轮对话、32 项游戏任务、635 条本地音频引用。十二主题仍为草稿，数量不等于产品已可发布。
- 玩法为场景找物、故事排序、选择并放置、听音收集四类。排序可撤回重排并保存恢复，场景找物需先听完目标音。
- 全主题 WAV 技术检查、生成清单的文本/声音名称/哈希一致性检查已纳入统一检查；听感、音频实际文本对应、内容质量及分发权限仍待审阅。
- 后端隔离测试 43/43、统一检查 61/61 通过；详情见 `reports/checks-latest.json`。自动检查不等于浏览器体验验收。
- 按用户决定不展示家长设置。默认单段 480 秒、每日 900 秒；development 模式不限时，继续记录时间与进度。正式模式保留时限。
- Chrome 布局、实际播放、后台、刷新、多页互斥、断外网与家庭观察仍待验。

## 启动与检查

需要 Python 3.10+ 和 Node.js，无需 pip 安装。在项目目录运行：

```powershell
.\.venv\Scripts\python.exe app.py
```

打开 http://127.0.0.1:8765 。仅监听本机；家庭库为 data.sqlite3，禁止对家庭库运行故障、清除测试。

预览改用 `python app.py --preview`：每次启动用全新临时库（不碰家庭库），页面打开时自动清掉浏览器里上一次预览留下的待确认记录和活动凭据，避免「体验编号无效」卡住。

```powershell
node check.cjs
node content-audit.cjs
node check-s4-audio.cjs
node s5-release.cjs
```

统一检查实际运行 `verify-s3.py`，测试使用临时/内存库。可通过 `MOMO_PYTHON` 指定解释器；无可用解释器且无当前源码匹配的完整报告则阻断，不能用历史 3 项测试替代。

`s5-release.cjs` 当前应返回发布阻断，报告为 `reports/s5-release.json`；实机核验页为 `/dev/s5-review.html`。

逐幕图文和逐条声音审阅页为 `/dev/content-review.html`，可下载本次审阅笔记；本页不写家庭业务记录。隔离验收可运行 `python scripts/preview-isolated.py`，打开 `http://127.0.0.1:8766`。

## 音频与维护

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\make-s4-audio.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\make-s4-audio.ps1 -SceneId dressing
node check-s4-audio.cjs
```

使用 Windows SAPI 离线合成，重复执行保留来源条目及文件哈希；声音和素材仍需人工审阅。开发系统语音回退不能证明离线交付通过。

内容源为 `launch-content.cjs`、`extra-themes.cjs`、`content-v2.cjs`，运行 `node build-content.cjs` 重建主题和场景图；修改文稿时同步提升内容版本并生成新声音路径，不能让旧音频冒充新文稿。

功能基线见 [PRD v1.8](../MomoPlanet-墨墨星球-PRD-v1.8-产品决策与交付基线版.md)，后续决定见 [AGENTS.md](AGENTS.md)，视觉遵循 [设计规范](DESIGN_SYSTEM.md)。旧 README 见 [历史快照](docs/README_HISTORY_2026-10-30.md)。
