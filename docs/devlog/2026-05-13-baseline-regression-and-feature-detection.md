# Baseline 升级 regression · 桥接层改用 feature detection

**Date**: 2026-05-13
**Status**: ✅ Bug 已修 · 80/80 tests pass against 新旧两个 GA 版本 · 工作流文档已更新
**Related**:
- 上游事件：[2026-05-13 baseline 升级 cf65515 → 6bb3104](./2026-05-13-ga-baseline-upgrade-cf65515-to-6bb3104.md)
- CLAUDE.md § GA Baseline（适配描述已更新）
- CLAUDE.md § Baseline Upgrade Workflow（新增 backward-compat 测试矩阵 + feature detection 强制规则）
- 受影响文件：[bridge/handlers.py](../../bridge/handlers.py)

## Context

刚 ship baseline 升级 [92a48fe](https://github.com/wangjc683/genericagent-workbench/commit/92a48fe) 当天，作者发现「New Chat 发消息后光标一直闪烁，sidebar 一直显示『思考中』」—— 整个 GA agent loop 在第一次 dispatch 就死掉，所有后续事件（turn_end / run_complete）都不再 emit，desktop 端 `agentRunning=true` 永远清不掉。

排查 5 分钟定位：上次升级我把 `WorkbenchHandler.dispatch` **硬绑到了新 GA 的签名**（5 参数，含 `tool_num`），但作者本地 GA 还停在 `d2840ae`（在 breaking change `3205f4a` 之前）—— BaseHandler.dispatch 只接 4 参数。`super().dispatch(tool_name, args, response, index, tool_num)` 直接 `TypeError: dispatch() takes from 4 to 5 positional arguments but 6 were given`，generator 内部炸掉。

跑测试也复现：

```
cd ~/Documents/GenericAgent && git checkout main   # 回到 d2840ae
cd ~/Documents/genericagent-webui && .venv/bin/python -m pytest bridge/tests/
> FAILED test_non_approval_tool_passes_through
> TypeError: BaseHandler.dispatch() takes from 4 to 5 positional arguments but 6 were given
```

## Decisions

### 1. 桥接适配规则 · 从「硬绑」改成「feature detection」

[bridge/handlers.py](../../bridge/handlers.py) 在模块加载时探测当前 GA 的 `BaseHandler.dispatch` 是否支持 `tool_num` 参数：

```python
import inspect
_BASE_DISPATCH_SUPPORTS_TOOL_NUM: bool = (
    "tool_num" in inspect.signature(BaseHandler.dispatch).parameters
)
```

然后 `WorkbenchHandler.dispatch` 末尾按结果分支：

```python
if _BASE_DISPATCH_SUPPORTS_TOOL_NUM:
    return (yield from super().dispatch(tool_name, args, response, index, tool_num))
return (yield from super().dispatch(tool_name, args, response, index))
```

效果：**对 baseline 6bb3104（含 tool_num）和旧版 GA（不含）都正确**，桥接层不强制用户跟着升级 GA。

### 2. Baseline Upgrade Workflow 加两条新规则

更新到 CLAUDE.md，未来每次 baseline 升级都要遵守：

**Rule 1（接口适配）**：**优先 inspect.signature feature detection**，不要硬绑签名。
> 用户的本地 GA 可能落后于 baseline。桥接适配既要兼容 new baseline，也要兼容 old GA。

**Rule 2（测试矩阵）**：跑测试必须**两个版本都过**。
> a. 切到 upstream/main 跑 → 验证 forward compat
> b. 切回用户当前 GA 跑 → 验证 backward compat
>
> 上一次升级我只跑了 a，没跑 b，所以漏了。

## Rejected alternatives

**让用户先 `git pull` GA 再用 Workbench**
否决理由：
- 违反项目宪法（CLAUDE.md「不能影响 GA 独立运行 / 不政策化升级节奏」）
- 是 Workbench 在「逼」用户改 GA，本末倒置 —— Workbench 应该适配 GA，不是反过来
- 用户不一定能感知到 baseline 跟自己 GA 版本错位（不会主动看 Settings → Runtime → GA Version）

**把 `tool_num` 当做 kwarg + 用 `**kwargs` 接收来「优雅」绕过**
否决理由：
- Python 的位置参数不会被 kwargs 截获，仍然报 TypeError
- 即使能绕过签名检查，super().dispatch 实际处理时还会因为 args 不符触发其它错误

**完全删除 `tool_num` 参数透传（pre-baseline-upgrade 状态）**
否决理由：
- 新 GA（≥ 3205f4a）的 do_* 工具实现读 `args['_tool_num']`。不传 = 默认走 1，行为退化为 maxlen 不缩减
- 长期看新 baseline 用户会受影响（context blow up 风险）
- 兼容方案（feature detection）只多 ~5 行代码，没有这么激烈方案的必要

## Methodology lesson

**「上游 API 演进 + 用户自治 = 必须 feature detection」**

GA Workbench 的产品定位是非侵入式桥接层。**用户控制 GA 版本节奏，桥接层兼容版本范围而不是单点**。任何对 GA API 的适配都应该用 feature detection（inspect.signature / hasattr 等动态探测），而不是硬绑某个具体 commit 的签名。

这条原则我之前漏了，这次踩坑学到。**已写进 CLAUDE.md 的 Baseline Upgrade Workflow（升级 procedure 第 3 步）**，未来无论是我还是 Claude 接手升级，都不该再犯。

测试矩阵（forward + backward）补到了 CLAUDE.md 升级 procedure 第 4 步。

## Open questions

- **是否要写一个 "minimum GA version" 静态检查**？比如 handler 启动时如果发现 GA 版本太旧（缺少必要 hooks），就 emit error event 告诉用户。当前是悄悄降级到老协议路径，有时候降级路径功能不完整（比如 do_* 工具不会按 tool_num 缩减 maxlen），用户可能不知道为什么 context 越来越长。
- **CI 怎么跑两版本测试矩阵**？目前 baseline upgrade 测试矩阵是手动跑 git checkout + pytest，CI 里可以 setup 一个 matrix（不同 GA commit）跑。但 Workbench 没有 CI，作者一直手动。等未来需要可以补上。

## Next

- Commit 这个修复 + 文档更新作为 backward-compat regression fix
- 在新 session 中继续 dogfood，验证「New Chat 发消息 → GA 回复完后 sidebar 翻到「已完成」」正常运行
