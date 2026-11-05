# 发布收尾记录 · 2026-10-30

本轮开始发布收尾，当前正式发布仍阻断。未修改家庭数据库，未切换开发模式，未将 draft 情景标为 released。

## 已完成

修复 S5 发布检查器错误地要求内部整理样例正式发布的问题。正式发布按 releasedScenes 核验；内部样例仅保留诊断。空清单、重复 ID、不存在情景、已列入发布但未批准或资源不齐仍会阻断。开发清单为空时继续检查 previewScene，便于呈现野餐的实际资源缺口。

`release-scenes.cjs` 纳入发布版本指纹和统一检查源码指纹；本轮变更后需要重新生成及采集实机证据。

验证：S5 专项5/5通过，统一检查47项通过、1项Python阻断；整体 incomplete。报告见 reports/checks-latest.json、reports/release-closeout-check-output.txt、reports/s5-release.json。

## 当前阻断（本轮重新核查）

- 当前野餐包需要54项声音，已有3项，缺51项；这是当前内容包的检查结果，旧文档10/40不能代替当前结果。文件存在也不代表听感及素材来源审核通过。
- 执行 make-s4-audio.ps1 时 SAPI Speak 返回 E_ACCESSDENIED；无新增音频。生成器本身不能作为声音交付证据。
- 执行 .venv\Scripts\python.exe verify-s3.py 时无法找到虚拟环境指向的 Python312 基础解释器。py -0p 亦未找到安装。尝试从 python.org 下载独立运行时因无法连接服务器失败，未安装运行时。本轮工具结果不覆盖此前用户本机验证事实。
- Chrome 运行中的墨墨星球窗口可被列出，但 get_window/get_window_state 阶段应用操作授权等待超时。本轮没有取得页面截图、没有执行点击或改变网页业务数据，视觉验收仍未执行。
- 发布清单为空，野餐仍为 draft，目前为 development 不限时模式；没有自动更改这些用户选择。

## 恢复验收

在可访问 Python 的本机项目目录先运行 `.venv\Scripts\python.exe verify-s3.py`；若使用其他安装，设置 MOMO_PYTHON 指向实际 python.exe 后运行 `node check.cjs`。音频可在本机运行 `powershell -ExecutionPolicy Bypass -File .\make-s4-audio.ps1`，随后 `node check-s4-audio.cjs` 检查当前资源数量，另行实际试听及来源审阅。

运行 `node s5-release.cjs` 更新检查与版本清单，在 `/dev/s5-review.html` 按实际情况填写核验；故障、日期、清除等实验仅用隔离数据库。未完成的项目保持未测试，家庭观察保持自愿。所有必要证据齐全后再执行正式发布模式验收。
