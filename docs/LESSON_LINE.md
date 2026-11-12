# 一节课一条线（2026-11-09）

主题首页不再并列"故事 / 对话 / 游戏 / 单词"四个入口，只保留一个"开始这节课"（进度中显示"继续上次"）。一节课默认按顺序走，答错不扣分、不显示对错计数。2026-11-09 起左侧有步骤导航，可点击跳到任意一步，也可点「上一步」；进入任一步都从头重做该步。设计稿见 `aios/diagram/docs/superpowers/specs/2026-11-09-momo-lesson-line-design.html`。

## 当前行为

课程步骤（`pack.lesson.steps`，由 `lesson-build.cjs` 生成）顺序：

1. `words`：认识本课单词（点图卡听，不要求全部点完）。
2. `story`：逐幕听故事；每幕之后可跟 0 个或多个 `quiz`（选图题，`afterScene` 决定位置）。2026-11-12 起前端把第一个到最后一个 `story` 步（及其间的 `quiz`）合成**一页**「故事」：导航只一项，页内先英文总标题（`lesson.title`，没有就用中文主题名），每幕插图作分隔，所有台词连成一段对话，题目就地出现。底层步骤与 step id 不变，读到哪一幕 `index` 就移到哪一幕的真实步骤（不重绘），进度、`heard`、每幕一次 `story_listen` 照旧。最后一幕之后的 `quiz` 仍是单独一页。
3. `fill`：取第一句含本课单词的故事句，挖掉该词，选词补全。
4. `reply`：对话补全，两个回答里选对的（错的一个来自题目源 `replies`）。
5. `game`：只玩情景互动里的**一道**题，点"先跳过"即离开这一步（规则 R8，不是整局游戏）。
6. `match`：听词配图，本课每个词一对（`tidy` 只有 3 个词就是 3 对，不写死 4）。
7. `end`：完成页，贴纸获取规则不变（每主题每天首次 `introduced` / `choice` 发参与贴纸）。

通用规则：

- `quiz` 与 `reply` 步骤带 `review: true`。`lesson.reviewed` 不是 `true`（或没有 `content-lesson/<id>.json`）时，这两类步骤在前端被过滤，其余照常。当前 park、birthday 都是未审核状态，所以实际只走 words / story / fill / game / match / end。
- 答错：该项晃动，Momo 提示"再试试"；**同一题连错 2 次**高亮正确答案并读一遍，然后可以"继续"。没有扣分，也没有错误计数展示。
- 中文题目不配读音。题目选项和答案只用本课单词（`modules.summary`）。
- 点击进入故事页（导航「故事」、认识单词的「下一步」、「上一步」回到故事、「从头听」）会自动朗读：英文标题，然后逐句读完全部幕，正在读的句子高亮并滚到可见处（系统减少动态时不平滑滚动）；遇到未答的题停下，答对或已给出答案后自动接着读下一幕。「暂停声音」或点某一句都会停下，出现「接着听故事」，从没听完的那句继续。刷新/恢复进入故事中途**不**自动播音，只显示「接着听故事」。其他步骤进入或恢复页面仍不自动播音。
- 选图题（故事页内和单独一页的 `quiz`）：点图只播这个词并选中（`aria-pressed`），不提交；点「找到了」才按原 `lesson_answer` 提交。题目读音文件缺失（还没合成）时，点读先尝试本地文件，失败时由浏览器语音朗读，仍可作答和继续。
- 作答用 `lesson_answer` 记录（`stepId`、`attempt`、`correct`、`selectedId`），先保存成功再改界面。刷新后从同一步恢复，已错次数保留（再错一次就给答案）。内容版本变化导致 `lesson` 进度对不上时，从头开始这节课，不报错。
- 额度、暂停、退出规则不变。
- 页面加载时对 `pack.assets` 逐个 `HEAD` 检查文件是否存在；id 含 `.lesson.` 的题目读音资源**不参与**这项检查（它们可以暂时缺文件，见下"读音"），否则 park 这类"题目源已写、读音未合成"的手写主题会整页打不开。

## 数据格式

题目源 `content-lesson/<sceneId>.json`（人和智能体都可写，除 `reviewed`）：

```json
{ "sceneId": "park", "generatedBy": "momo_agent", "reviewed": false, "sourceVersion": "0.2.0",
  "quiz":    [{ "afterScene": 2, "question": "...", "options": ["tree","flower","ball"], "answer": "tree" }],
  "replies": [{ "dialogueId": "park.dialogue.1", "text": "I want my ball.", "cn": "...", "word": "ball" }] }
```

- `sourceVersion` 必须等于内容包当前 `baseVersion`，否则 `lesson-build` 判为"题目基于旧内容，需重新生成"并忽略题目（只告警，不报错）。
- 选项/答案写单词 id 或单词文本均可（忽略大小写）；`afterScene` 在 1..故事幕数；`replies.dialogueId` 必须存在。

内容包 `static/content/<id>.json` 的 `lesson`：`{schemaVersion:1, baseVersion, reviewed, steps}`，另有 `assets` 里 id 含 `.lesson.wrong.` 的错误回应读音（路径 `audio/<id>/lesson/<sha8>.wav`，文本变则路径变）。

版本规则：`lesson-build.cjs` 重算时去掉旧 `lesson` 再生成；整包（除版本字段）不变则沿用原 `contentVersion`；有变化则补丁号 +1、旧版本记入 `compatibleFrom`，并把旧包归档到 `static/content/archive/`。幂等：重复运行输出 "unchanged"。已知限制：已带 `lesson` 的包不能靠手改 `contentVersion` 抬版本（会回到 `lesson.baseVersion`），要先在 `build-content.cjs` 一侧抬基础版本。

后端：`storage_v3.py` 增加 `lesson` 模块（进度校验：步骤 id、尝试次数、配对进度、回应轮次、故事片段）与 `lesson_answer` 记录校验。

## 审核与读音流程

1. 生成：`python -m momo_agent quiz <id>`（已有主题补题），`python -m momo_agent generate <topic>` 新主题时也同时写题目。输出 `reviewed:false`，**智能体流程永不设置 `reviewed`**。
2. 预览后由人运行 `python -m momo_agent quiz-approve <id>`，这是唯一把 `lesson.reviewed` 置为 `true` 的途径（题目源过期时拒绝批准）。
3. 读音：
   - 所有主题（手写或智能体生成）：`python -m momo_agent quiz-audio <id>` 用 Kokoro 合成缺的文件，Mac/Windows 相同；Windows 也可用 `make-s4-audio.ps1 -SceneId <id>`（转调同一命令）。首次合成前运行 `python scripts/download-kokoro.py`。
   - 过场读音（id 含 `.lesson.bridge.`，路径 `audio/<id>/lesson/bridge-<sha8>.wav`）同上合成。
   - 复习词读音（id 含 `.lesson.review.`）：借用来源关已有的文件；`quiz-audio --all` 整关重配时跳过，由来源关重配，清单里指向同一文件的条目会自动跟上新哈希。

## 检查

新增（已纳入 `check.cjs`）：`check-lesson-build.mjs`（生成与校验、tidy 三对）、`check-lesson-state.mjs`（状态机、刷新恢复）、`check-lesson-flow.mjs`（全主题走查、双击只记一条）、`check-lesson-http.mjs`（真实 HTTP 保存/恢复；用 `MOMO_PYTHON` 或 `python3`/`python` 启动服务）。智能体侧在 `momo_agent/tests/`。原先断言首页三个入口的检查已按新的单入口首页更新（规则 R2）。

验证结果（2026-11-09，分支 `feature/lesson-line`，对比 master@9c3bd58 基线，未新增失败）：

| 项目 | 基线 | 现在 |
|---|---|---|
| `node check.cjs` | 61 项，6 项失败 | 68 项，同样 6 项失败 |
| `python3 verify-s3.py` | 43 项，1 失败 + 5 错误 | 50 项，同样 1 失败 + 5 错误 |
| `momo_agent` 全量测试 | 95 项 OK | 114 项 OK |
| `momo_agent eval` | 4/4 | 4/4 |

`check.cjs` 的 6 项失败在基线上就存在：`check-launch-content.mjs`、`check-integrated-http.mjs`、`check-reload.mjs`、`check-reload-http.mjs`、`check-themes.mjs`、`storage: project tests only`（其中部分是因为本机没有 `python` 命令）。`verify-s3.py` 的失败是"13 != 12 启动主题数"和 5 个 `test_s3_http` 错误。这些均未在本次处理。

浏览器走查（Playwright / Chromium，临时库 + `app.py`，park，`lesson.reviewed=false` 的真实状态；1366x768 与 1280x720）：走完全课 words、6 幕 story、fill、game（跳过）、match、end；fill 步骤答错一次后刷新，首页显示"继续上次"，回到同一题，再错一次即高亮正确答案并出现"继续"；match 连错两次出现正确答案高亮；无横向滚动；0 个 console error。截图在 `aios/diagram/docs/superpowers/specs/2026-11-09-momo-lesson-line-assets/run/`（不入库）。

走查发现并已修：park（读音未合成）整页打不开，提示"主题本地图片或声音不完整"，原因见上"当前行为"最后一条，修在 `static/main.mjs`。

首屏可见（设计稿 §9）：课程模式（`#app` 带 `lesson-mode` 类）下去掉单入口章节导航，进入时不自动插入"玩法示范"条（"听听怎么玩"仍可随时打开），进入/下一步都把课程卡滚到粘性顶栏下方（`scroll-margin-top`），标题收小，游戏步骤不显示"LET'S PLAY · n / 4"计数（只玩一道题），场景图宽度按 `40vh` 封顶。旧的单独入口（故事、对话、游戏、单词）不带该类，版式不变。park 走查中每一步（words、6 幕 story、fill 及答错揭示后的"继续"、game、match 及配对完成后的"继续"、end）在 1366x768 与 1280x720 下，主按钮（"下一步 / 跳过"、"听这一幕"、填空词块与"听这句话"、"先跳过"与"听听要找什么"及全部热点、配对图块与"听一听"、"继续"、"再玩一次"）的包围盒都在视口内，无需滚动，脚本逐步断言。只走查了 park，birthday 等其他主题的步骤高度未逐一量过。

**未在浏览器里走查 quiz 与 reply 步骤。** park 与 birthday 都是 `reviewed:false`，这两类步骤在界面上被过滤；它们只由 node 检查（状态机、flow、http）覆盖，题目 UI 的版式与"主按钮在首屏"对它们没有浏览器证据。

页面加载的资源检查已抽成 `static/core/boot-assets.mjs`，`check-lesson-state.mjs` 里有回归测试：缺少 `.lesson.` 读音不拦截，缺少普通资源仍判失败（去掉过滤时该测试失败）。

## 未执行的验收（如实说明）

以下四项**未执行**：

1. Windows Chrome 实机走查。
2. 扬声器听感（题目读音、错误回应读音）。
3. 用真实模型为 12 个手写主题生成题目（目前只有 park、birthday 有题目源，且都是 `reviewed:false`）。
4. 在 Windows 上为手写主题合成题目读音。

用户侧待办：补模型 Key 后对 12 个手写主题逐个 `python -m momo_agent quiz <id>`，预览后 `quiz-approve`；对补过题的主题运行 `python -m momo_agent quiz-audio <id>`；Windows Chrome 实机走一遍至少一个主题。

## 地图关联（2026-11-10）

- 第 2 关起，`words` 步骤开头多 3 张复习卡（`step.review`，由 `lesson-build.cjs` 按 `route-build.cjs` 的规则写入课程层）：取前面关卡学过、本关 `modules.summary` 没有的词，最近学到的先复习；只点读，不发 `introduced`，不进填空、配对、结束页。第 1 关没有复习卡。
- `lesson.bridge` 是关与关之间的过场（文字与读音，读音在 `audio/<id>/lesson/bridge-*.wav`）；复习与过场的资源 id 含 `.lesson.`，不改基础内容与 `lesson.baseVersion`。过场读音与其他读音一样由 `quiz-audio` 合成；`quiz-audio --all` 跳过 `.lesson.review.`。
- `lesson.title` = `{text, audio}` 是整课的英文标题（旁白 narrator 读音 `audio/<id>/lesson/title-<sha8>.wav`，资源 id `<id>.lesson.title.audio`）：手写主题与 birthday 取 `lesson-titles.cjs`，日关取 `content-days/*.json` 的 `plan.levels[].title_en`（智能体日计划必填、≤6 词）；没有标题的关不写该字段，客户端需容忍缺失。
- 走到 `end` 步骤时记录 `cleared`（该关通过）；结束页多一个「去下一站」，回到 `/?focus=<下一关>`。返回按钮为「← 回地图」。
