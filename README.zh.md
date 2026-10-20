# dsh-deepseek-cny-cost

**在 DeepSeek Harness（DSH）Web GUI 里，看到你正在读的这条聊天已经花了多少人民币。**

输入卡片下方、会话统计旁边，多一枚小徽标：

```
≈¥0.0123
```

- 数字是**当前这条聊天**的累计花费，切到别的聊天就是那条聊天的数字，说话、跑工具时实时增长；
- 悬停（或用读屏）可以看到明细：未命中输入 / 缓存命中 / 输出各多少 token、各花了多少；
- 只有当前模型的 provider 属于 DeepSeek 官方时才会显示，第三方中转不显示（它们不按官方分时价计费）。

## 计价方式

数据来自 DSH 既有的两个会话投影，插件自己不发任何请求、不做任何测量：

| 数据 | 来源 |
| --- | --- |
| token 用量 | `tokenUsage` 投影（`uncachedInputTokens` / `cacheReadTokens` / `cacheWriteTokens` / `outputTokens`） |
| 当前模型 | `modelSelection` 投影 |

单价取 [DeepSeek 官方「模型 & 价格」](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)（2026-10 核对），单位：元 / 百万 tokens：

| 模型 | 缓存命中输入 | 缓存未命中输入 | 输出 |
| --- | --- | --- | --- |
| `deepseek-flash` | 0.04 | 2 | 8 |
| `deepseek-v4-pro` | 0.30 | 9 | 27 |

上表是**高峰价**。官方规则：空闲时段价为高峰价的一半；高峰时段为北京时间**周一至周五（不含中国法定节假日）9:00–12:00、14:00–18:00**，其余时段（含周末与法定节假日全天）为空闲时段。

- 缓存写入不单列计费，按官方口径并入"缓存未命中输入"；
- 旧模型名 `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp` 按 Flash 价格计费（官方说明）；
- 未收录的模型名**不显示徽标**，而不是猜一个价格。

## 已知边界

- **估算，不是账单**：按公开单价算，不含网页搜索 / 抓取等按次计费项；实际扣费以官方账单为准。
- **换过模型的聊天**：`tokenUsage` 是整条聊天的累计量，没有按模型拆分，因此单价统一取当前模型。若在一条聊天里前后用了不同模型，数字会有偏差。
- **节假日表**：内置 2026 年的法定放假日；表里没有的年份（例如 2027）退化为只按周末判断，届时节假日的白天会被当成高峰价。
- 显示条件是 DeepSeek 官方 provider（`deepseek-official` / `deepseek-account`，以及以 `deepseek` 开头的新增官方 provider）。

## 安装

**从 GitHub 装（推荐）**：侧栏 →「插件」→「添加插件」，填

```
github:zhiciyishuyicheng-dev/dsh-deepseek-cny-cost
```

安装源选「中国大陆镜像」更稳。装完若提示需要重启，就完全退出 DSH 再打开。

**从本地目录装（改代码时用）**：

1. 侧栏 →「插件」→「添加插件」；
2. 在「包名或地址」里填**本目录的绝对路径**（安装器支持本地目录，会记成 `link:` 依赖）：
3. 安装 → 启用；若提示需要重启，就完全退出 DSH 再打开，然后刷新页面。

命令行等价写法（profile 不是 `desktop` 时）：

```bash
dsh plugin --profile web add github:zhiciyishuyicheng-dev/dsh-deepseek-cny-cost
```

## 自定义

都在 `client.js` 顶部：

- `PEAK_PRICES`：单价表（高峰价，空闲自动减半）；
- `MODEL_ALIASES`：旧模型名归并；
- `PEAK_WINDOWS`：高峰区间（当日分钟数）；
- `BUILTIN_HOLIDAYS`：节假日兜底表；
- 槽位与顺序：`apply()` 里改 `name` / `order`（默认 `conversation.composer.dock`，`order: 2`）。

## 开发

```bash
node --check client.js            # 语法检查
node tools/test-cny-cost.mjs      # 定价、时段、格式化、槽位注册、组件行为，34 项断言
```

`client.js` 是浏览器半边的完整产物：用 `window.__ModuleLoader__.load({ id, factory })` 注册惰性工厂，`id` 必须等于包名；React 由宿主模块表提供，不自带。改完若要生效：先在插件页卸载，再用同一个路径装一次（重复装同一个源会报 `ambiguous-install`）。

## 许可

MIT。
