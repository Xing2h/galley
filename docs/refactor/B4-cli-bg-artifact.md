# B4 · CLI feature-complete + background mode + adapter artifact (stub)

```
Cursor:   (B4 未启动)
Status:   ⏳ Stub · 等 B3 完成 + B3 完成 devlog
Duration: 2-3 周（D51-D65）
Predecessor: B3 完成 + acceptance 全过
Successor:   v0.5 ship
```

**这是 stub**。B3 完成后启动 B4 前一个 dedicated session 把本文件填充成详细 playbook。

B4 是 polish + ship 阶段——所有 supervisor / agent-friendly 工件落地，Galley 第一次以"dual-native orchestrator"形态对外发布。

## 这个 phase 在干啥

3 件事并进：

1. **CLI feature-complete**：B1+B2 已实现 read + send_message + watch；B4 补齐 archive / btw / project / llm 全部写命令，凑齐 PRD §11.1 命令表
2. **Background mode (menubar daemon)**：关窗 → 隐藏不退出；只有 Cmd+Q 才退。menubar 图标 + active session badge
3. **Adapter artifact**：Galley Supervisor SOP for GenericAgent + galley-supervisor skill for Claude + `docs/agent-api.md` 公开契约定稿

B4 结束 = v0.5 RC，dogfood 一周后 ship。

## Prerequisites

- [ ] B3 全部 acceptance criteria 跑过 + devlog ship
- [ ] B1+B2+B3 累积的 regression suite 全过
- [ ] v0.1 / v0.2 dogfood 数据 migration 路径已设计 + 本地测试过（参考 [PRD §16](../PRD.md#16-数据迁移v01--v10)）
- [ ] Tauri tray plugin (v2) 版本评估 + 验证（macOS + Windows）

## Acceptance criteria · v0.5 RC

- [ ] **A1**: CLI 命令表（PRD §11.1）全部实现：
  - Inventory: list / search / brief / show / status / health / version ← 已 B1
  - Operate: new / send / btw / stop / archive / restore / watch ← send/watch 已 B2，其余 B4
  - Project: create / list / move / archive
  - Config: llm list / llm set
- [ ] **A2**: 每个 CLI 命令在 `docs/agent-api.md` 都有完整 schema 文档
- [ ] **A3**: Background mode 工作：关窗 → 隐藏，Cmd+Q → 真退。Galley Core 持续跑 (menubar 图标存在)
- [ ] **A4**: Menubar 图标：静态 / N active session badge / 点击下拉菜单可 Show Galley / Quit
- [ ] **A5**: Galley Core 完全退出后 CLI 报 exit 4 "Open Galley first"
- [ ] **A6**: `~/.config/galley/cli-path`（mac / linux）/ `%APPDATA%\galley\cli-path` (windows) discovery file 在 GUI 首次启动后存在，内容是 CLI binary 绝对路径
- [ ] **A7**: Settings → Integration 有 "Install `galley` to PATH" 按钮，点击触发 sudo + symlink（macOS）或写用户 PATH（Windows），可逆
- [ ] **A8**: Settings → Integration 有 "Install Supervisor SOP into your GA" 按钮（[CLAUDE.md SOP 安装例外条款](../../CLAUDE.md)），把 `galley-supervisor-sop.md` 写入用户配置的 GA `memory/`
- [ ] **A9**: `docs/integrations/galley-supervisor-sop.md`（GA SOP）写完 + dogfood 验证（让 GA + WeChat frontend 通过 SOP 控制 Galley 跑通一个完整 supervisor scenario）
- [ ] **A10**: `.claude/skills/galley-supervisor/` Claude Skill 包写完 + 在 Claude Code 里加载试用通过
- [ ] **A11**: v0.x → v0.5 数据 migration (006-009 加 supervisor / origin_note / created_via 字段) 在自己机器上跑过 + 数据完整
- [ ] **A12**: TopBar / GUI per-session 显示 supervisor 行动日志（PRD §6.1 #4）：穿插 human / supervisor 动作 + reason
- [ ] **A13**: 所有 Galley 架构原则（[CLAUDE.md](../../CLAUDE.md)）在 code review 中能逐条 demo：localhost only / CLI 公开契约 / 数据不离开 Galley / 路径 B 不可逆
- [ ] **A14**: dogfood 一周（B4 完成后），零 P0 / P1 bug，准备 v0.5 ship

## Milestone 大纲

- **M1: CLI 写命令补齐** (D51-D54)
  - `galley session new <task>`
  - `galley session btw <id> <q>`
  - `galley session stop <id>`
  - `galley session archive / restore`
  - `galley project create / list / move / archive`
  - `galley llm list / set`
  - 每个命令在 `core/src/api.rs` 加 trait method + Tauri command + CLI subcommand
- **M2: Background mode (menubar daemon)** (D55-D57)
  - Tauri tray plugin v2 setup
  - 关窗事件改为 hide (`window.hide()`) 不 close
  - Cmd+Q 走标准退出
  - menubar 图标 + badge (active session count)
  - menubar 下拉菜单：Open Galley / Quit / "N active · M idle" 状态行
  - 首次关窗弹一次"Galley 还在 menubar 跑"引导
  - 验证：Tauri WebView 在 window hidden 时 JS 继续跑（App Nap 处理？）
- **M3: Discovery file + Settings integration** (D58)
  - GUI 首次启动写入 `~/.config/galley/cli-path` (or platform equivalent)
  - Settings → Integration tab 新建：
    - "Install `galley` to PATH" 按钮 + 状态 indicator
    - "Install Supervisor SOP into your GA" 按钮（检测同名文件 → 提示 → 写入）
    - "Open agent-api.md docs" 跳转
- **M4: GA Supervisor SOP** (D59-D60)
  - 写 `docs/integrations/galley-supervisor-sop.md`
  - 内容：discovery file 读取 + CLI 用法 + 常见 scenario + destructive 命令 confirm 守则
  - dogfood：在自己 GA + 飞书 frontend 上装上跑通
- **M5: Claude galley-supervisor Skill** (D61)
  - 写 `.claude/skills/galley-supervisor/SKILL.md` + auxiliary
  - 在 Claude Code 上加载验证
- **M6: agent-api.md 定稿** (D62)
  - 全部命令的 schema + exit code 表 + stability promise 段
  - publish 准备：检查 schema_version=1 是否已经定型，B4 内做最后调整（v0.5 ship 后就 frozen）
- **M7: Per-session supervisor 行动日志 GUI** (D63)
  - Session timeline view 加 supervisor 动作 entry（穿插在 messages 间）
  - hover 显示 supervisor / reason / 时间
- **M8: v0.x → v0.5 data migration 真跑** (D64)
  - 备份现 dogfood 数据
  - 跑 migration 006-009
  - 验证：所有老 session / messages 完整，新字段 default 正确
  - 若失败，按 [PRD §16](../PRD.md#16-数据迁移v01--v10) 拒启动 + 显示数据目录
- **M9: B4 acceptance + v0.5 ship 准备** (D65+)
  - 跑 A1-A14
  - dogfood 一周
  - Release notes
  - tag v0.5 + 推 GitHub Release
  - Update PRD / CLAUDE.md / refactor README 标 v0.5 ✅
  - 写 B4 完成 devlog + v0.5 release devlog

## 已知风险

- **风险 1: Tauri v2 tray plugin Mac / Win 兼容性**
  - Tauri v2 系统 tray API 还相对新，多平台行为可能不一致
  - 缓解：B4 启动前先做一个 1-day prototype 验证 tray + hide window + WebView keep-alive
- **风险 2: App Nap (macOS)**
  - window hidden 时 macOS 可能进入 App Nap，影响 CLI 响应速度
  - 缓解：用 `NSProcessInfo` API disable App Nap，或者用 Rust crate
- **风险 3: SOP 安装路径冲突**
  - 用户 GA `memory/` 可能已有 `galley-supervisor-sop.md`（用户手动放过 / 或上次安装残留）
  - 缓解：检测同名 → 提示用户「保留 / 覆盖 / 取消」，不静默覆盖
- **风险 4: Migration 数据丢失**
  - dogfood 数据是 6+ 月积累的真实 session，丢一次永远失去
  - 缓解：migration 跑之前 Galley 内 hard-coded 备份步骤——先 copy `~/Library/Application Support/app.galley/` 整个目录到 `~/Library/Application Support/app.galley.backup.<timestamp>/`，再跑 migration；失败 → 用户能找回
- **风险 5: GA SOP 在 IM frontend 里 dogfood 不顺**
  - SOP 写得再清楚，agent 在真实环境里可能有歧义、误用
  - 缓解：M4 在自己微信 / 飞书上跑 1-2 周，发现问题 iterate

## Open decisions（B4 启动前要拍）

- [O1] menubar 图标：静态图标 + 数字 badge 还是 dynamic state icon？倾向静态 + badge
- [O2] CLI 在 Windows 上的"Install to PATH"具体写法（用户级 PATH vs admin）
- [O3] Discovery file 路径在 macOS 上：`~/.config/galley/`（XDG）vs `~/Library/Application Support/app.galley/`（Apple convention）。倾向前者（跨 OS 一致 + supervisor SOP 不用分支）
- [O4] Supervisor 行动日志 GUI 渲染密度：每个动作一行？合并相邻动作？hover 详情？
- [O5] v0.5 ship 时 README 改写：现在仍是 v0.1 "本地桌面工作台" framing，v0.5 改成 dual-native 措辞
- [O6] Homebrew tap：v0.5 包不包？倾向不包，留 v0.6+

## Running notes / gotchas

（B4 启动前空白）

---

## v0.5 ship 完成后

- README 改写定稿
- DESIGN.md onboarding subtitle 改新 framing
- 投 Galley Supervisor SOP 到 fudankw.cn/sophub（如果 sophub 接受）
- GitHub Release notes 强调 dual-native 转折 + migration 兼容性
- Twitter / 社区公告（如 JC 想做）
- 收集第一批 v0.5 用户反馈 → 排 v0.6+ 优先级
