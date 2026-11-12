# 墨墨星球开发约定

- 2026-11-03 刷新误报多页占用已修复：保留浏览器 Web Lock 与服务端写租约两层互斥，刷新通过已保存的旧凭据安全交接，禁止用无条件抢锁或清空家庭库绕过。卸载须同步入队最后计时/待保存进度并立即发释放请求，不能等待其他网络请求；退役文档不得重新 acquire。重连与恢复计时器须合并，恢复不自动播音。修改相关生命周期后运行 `check-reload.mjs`、`check-reload-http.mjs` 与统一检查。原因、验证和实机未验范围见 `docs/RELOAD_HANDOVER_FIX.md`。

- 2026-11-03 最新交互决定：对话与小游戏整合为“情景互动”，选回答即提交、接话并进入下一句，不再显示“就这样回答”。当前主题首页三个入口，数据层原有四moduleId与历史不合并；恢复小游戏需保留finished和部分排序。故事“重听这一幕”必须真的开始播放，不能只重置进度。此决定替代旧的预听后二次确认流程；进入/恢复页面仍不自动播音。验证运行 `check-story-playback.mjs`、`check-integrated-interaction.mjs`、`check-integrated-http.mjs` 及统一检查。见 `docs/INTERACTION_INTEGRATION.md`。

- 2026-11-03 后续用户要求故事更完整、角色互动更多，游戏更多样、减少重复点选。当前为十二主题、四种玩法开发预览，最新范围见 `docs/CONTENT_V2.md`；内容源增加 `content-v2.cjs` 和 `extra-themes.cjs`，游戏渲染增加 `static/modules/game-novel.mjs`。新记录模式 `scene_find_game`、`story_order_game` 必须通过前后端验证，不能仅用 UI 模拟宣布保存完成。运行 `node check-narrative-games.mjs` 和统一检查；旧八主题记录保留历史，不作为最新交付体量。

- 2026-11-03 用户确认首批八主题内容建设方向。首发范围见 `docs/CONTENT_BASELINE.md`，取代旧 PRD 仅野餐发布的内容范围；八主题仍为开发草稿，不自动批准发布。内容源 `launch-content.cjs`，生成 `build-content.cjs`，逐幕素材源 `draw-content-assets.cjs`；修改内容同步版本与对应音频，保留归档和家庭历史。运行 `node content-audit.cjs`、`node check-launch-content.mjs` 及统一检查；357条生成声音清单匹配不等于听感/语义/权限审阅通过。审阅页 `/dev/content-review.html` 不写业务记录。

适用于本目录及子目录。

- 2026-10-29 用户明确使用 Chrome，目标验收浏览器为 Windows 上的 Google Chrome 稳定版；这替代此前 Edge 的约定。不要再次要求用户切换 Edge。其余缩放、视口及鼠标条件保留。

- 开始界面开发前，阅读 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)。用户已确定采用统一的手绘绘本风格，后续开发须延续此基线。
- 新页面、新情景和加载、空白、失败、暂停、完成等状态均使用同一视觉语言；不能只为首页应用手绘样式。
- 优先复用 `static/sketch.css`、当前 `core/dom.mjs` 的image及App.assetImage封装和 `static/illustrations/`。旧sketchIcon保留于历史原型。不要用系统 emoji 替代角色、食物、篮子等主要插画。新增资源须保持现有描边、配色和比例。
- 调整共享组件时检查所有受影响模块，包含故事、对话、游戏、单词、贴纸及记录页。重构不得遗漏 `static/dialogue.js` 中实际生效的故事和对话实现。
- 视觉变化不得改变产品语义、播放与暂停、退出、记录、额度和获贴规则。功能以 PRD v1.8 为准，视觉以设计规范为准。
- 界面交付分别报告自动检查和真实视觉验收结果；未执行的浏览器检查不得写成通过。
- 若后续用户明确更改视觉方向，同步更新设计规范、相关资源和变更记录，避免出现多套互相冲突的基线。
- 用户已授权按阶段持续实施。每阶段实施后必须验证，失败先修复并复验，门槛通过才进入下一阶段；无需逐阶段重复请求开始授权。缺少实测条件应记录阻断，不能虚报通过或自行降低验收要求。执行状态见 `docs/STAGE_VERIFICATION.md`。
- S2起当前页面入口为 `static/main.mjs`，业务在 `static/core/`，四模块在 `static/modules/`，内容和入口清单在 `static/content/`。旧 `theme.js`、`dialogue.js` 已退出当前入口，仅作回归对照；不要只修改旧文件。`static/dev/` 保留S1原型与审阅证据，不能用旧原型检查冒充S2验证。
- S3存储在 `storage_v3.py`，新版接口在 `app.py`；前端正式使用PersistentStore，内部整理仍用隔离内存。验证后端必须运行 `verify-s3.py`，不复用已失效的3项旧后端证据。测试只用临时/内存库，禁止对家庭库运行故障或清除测试。版本升级须通过只读源库的副本验证及升级前备份；历史阶段已验记录不因后续开发被伪改为未验。

- 2026-10-29 用户最新决定：不需要家长设置，使用默认值。当前入口不展示家长设置，也不强制声音检查或PIN设置；默认单段480秒、每日900秒，保留额度、记录和恢复机制。这替代此前S4家长界面的产品要求。

- 2026-10-29 后续决定：开发期间取消限时。服务根据内容清单的 development 模式关闭单段和每日限时，继续累计时间并保存进度、记录；不清除家庭数据。正式模式仍保留时长限制。用户明确要求继续S5开发，可实施发布核验工具；缺少实机、声音或家庭观察时如实记录，不能宣布正式发布通过。

- 2026-10-30 S7：复习来源加载与试听在 static/core/review-sources.mjs；家庭来源只允许发布情景及开发预览，内部样例隔离。运行 node check-s7.mjs；不得用隔离包测试代替真实多情景音画验收，见 docs/S7_DELIVERY.md。

- 2026-11-09 主题首页改为"一节课一条线"：只有"开始这节课"一个入口，按 单词 → 故事（含选图题）→ 填空 → 对话补全 → 一道游戏 → 配对 → 完成 走；答错不扣分，同题连错 2 次给答案。题目源在 `content-lesson/<id>.json`，由 `lesson-build.cjs` 合进内容包 `lesson`；`lesson.reviewed` 只能由人运行 `python -m momo_agent quiz-approve <id>` 置为 true，智能体生成流程不得设置，未审核时跳过 quiz/reply 步骤。手写主题（无 `generatedBy`）的题目读音只能在 Windows 用 `make-s4-audio.ps1 -SceneId <id>` 合成，`quiz-audio` 在 macOS 拒绝。页面加载的资源存在性检查不含 `.lesson.` 读音。运行 `check-lesson-build.mjs`、`check-lesson-state.mjs`、`check-lesson-flow.mjs`、`check-lesson-http.mjs`、`momo_agent` 测试及统一检查。详见 `docs/LESSON_LINE.md`。

- 2026-11-09 课程页打磨（用户定）：故事每句带 `cn`，句后「中」图标点开才显示，替代整幕「看看中文意思」；手写主题中文在 `story-cn.cjs`。课程页左侧步骤导航可点击跳到任意一步，另有「上一步」；进入任一步都从头重做该步（`LessonState.goTo`）。手写主题每幕追加 1–2 句台词（`story-more.cjs`，id 为 `.more1/.more2`，只追加不改旧句）。「把故事接起来」卡片用英文短语并配 `labelAudio`。新增读音用 `python -m momo_agent quiz-audio <id>` 合成（见 2026-11-12 Kokoro 条）。

- 2026-11-10 「Momo 的一天」地图（用户定）：`/` 是一条从清晨到夜晚的路线地图，不再是主题选择页。固定顺序 washing、dressing、breakfast、weather、transport、park、picnic、shopping、gardening、cooking、tidy、birthday、bedtime（`catalog.route`，逻辑在 `static/core/route.mjs`，页面在 `static/core/day-map.mjs` + `static/day-map.css`）。必须一关关解锁：通过 = 该关课程走到 `end` 步骤（用「跳过」走完也算），重玩不撤销；后端 `cleared` 操作按关幂等记录，启动时按课程进度回填旧进度；离线时待发送的 `cleared` 也算通过。直接访问未解锁的 `/?scene=<id>` 回到地图并提示「先走完前面的路才能来」。`?unlock=all` 仅开发模式有效。结束页「去下一站」回 `/?focus=<下一关>`，Momo 沿路走到下一站（`prefers-reduced-motion` 时直接跳）。第 2 关起认词步骤开头有 3 张复习卡（前面关卡学过、本关 `modules.summary` 没有的词，最近学到的先复习），只播读音，不发 `introduced`，不进填空、配对、结束页；复习词与每关之间的过场（`lesson.bridge`）只放课程层（资源 id 含 `.lesson.`），基础内容与 `lesson.baseVersion` 不变。构建：`route-bridges.cjs`、`route-build.cjs`、`lesson-build.cjs`。主题页返回按钮「← 回地图」。设计与计划见 `aios/diagram/docs/superpowers/specs/2026-11-10-momo-day-map-design.html`。检查：`check-route.mjs`、`check-route-build.mjs`、`check-day-map.mjs`。

- 2026-11-12 读音改用 Kokoro（用户定）：`momo_agent/tts.py` 用 kokoro-onnx 的 int8 模型离线合成，Mac/Windows 同一套代码，不再用 macOS `say`/Windows SAPI。角色音色：narrator=af_heart、momo=af_bella、bunny=af_nova、fox=am_puck、turtle=bm_george（0.85 速），单个词 0.9 速；输出仍是 22050Hz 16 位单声道 WAV。模型约 120MB 不进 git，合成的机器先跑 `python scripts/download-kokoro.py`（存 `~/.cache/momo-kokoro`，校验 sha256）；只播放的机器不需要。缺的读音 `python -m momo_agent quiz-audio <id>`，整关重配 `--all`（跳过 `.lesson.review.` 借用文件和 S1 样音，S1 样音受 `reports/s1-user-confirmed.json` 锁定，保持原声）。Windows `make-s4-audio.ps1 -SceneId <id> [-All]` 只是转调同一命令。测试一律用 `daykit.silence` 替身，不加载模型。MP3 改造另立需求，未做。
