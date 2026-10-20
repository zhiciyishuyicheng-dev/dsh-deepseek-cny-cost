window.__ModuleLoader__.load({
  id: 'dsh-deepseek-cny-cost',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // ── 计价口径 ────────────────────────────────────────────────────────────
    // 单位：人民币元 / 百万 tokens。数据来源：DeepSeek 官方「模型 & 价格」页
    // （api-docs.deepseek.com/zh-cn/quick_start/pricing），2026-10 核对：
    //   deepseek-flash    缓存命中 0.04 / 缓存未命中 2 / 输出 8   （高峰价）
    //   deepseek-v4-pro   缓存命中 0.30 / 缓存未命中 9 / 输出 27  （高峰价）
    // 官方规则：空闲时段价 = 高峰价的一半，包含周末与法定节假日全天；高峰时段为
    // 北京时间周一至周五（不含中国法定节假日）9:00–12:00 与 14:00–18:00。
    const TZ = 'Asia/Shanghai';
    const PEAK_WINDOWS = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]];
    const PEAK_PRICES = {
      'deepseek-flash': { cacheHit: 0.04, cacheMiss: 2, output: 8 },
      'deepseek-v4-pro': { cacheHit: 0.3, cacheMiss: 9, output: 27 },
    };
    // 官方说明：这两个旧模型名仍可调用，但对应模型已下线，统一按 Flash 价格计费。
    const MODEL_ALIASES = {
      'deepseek-v4-flash': 'deepseek-flash',
      'deepseek-v4-flash-vision-exp': 'deepseek-flash',
    };
    const DEEPSEEK_PROVIDERS = ['deepseek-official', 'deepseek-account'];
    // 离线兜底的法定放假日（国务院办公厅放假安排，经 holiday-cn 汇总）。
    // 只影响"节假日是否算高峰"这一判断；表里没有的年份退化为只按周末判断。
    const BUILTIN_HOLIDAYS = {
      '2026': ['2026-01-01', '2026-01-02', '2026-01-03', '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23', '2026-04-04', '2026-04-05', '2026-04-06', '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05', '2026-06-19', '2026-06-20', '2026-06-21', '2026-09-25', '2026-09-26', '2026-09-27', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'],
    };
    const TICK_MS = 30000;
    // 诊断开关：拿不到数据时是否显示占位标记。稳定后可设为 false。
    const DIAGNOSTIC = true;

    /** 北京时间的日历字段；不依赖本机时区。 */
    function beijingParts(date) {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
      }).formatToParts(date);
      const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
      const year = Number(get('year'));
      const month = Number(get('month'));
      const day = Number(get('day'));
      const hour = Number(get('hour'));
      const minute = Number(get('minute'));
      return {
        year,
        date: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        weekday: get('weekday'),
        minutes: hour * 60 + minute,
      };
    }

    function isDeepSeekProvider(provider) {
      if (typeof provider !== 'string' || provider === '') return false;
      return DEEPSEEK_PROVIDERS.includes(provider) || provider.toLowerCase().startsWith('deepseek');
    }

    /** 高峰时段：周一至周五、非节假日、落在两个窗口内（左闭右开）。 */
    function isPeak(parts) {
      if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
      if ((BUILTIN_HOLIDAYS[String(parts.year)] ?? []).includes(parts.date)) return false;
      return PEAK_WINDOWS.some(([start, end]) => parts.minutes >= start && parts.minutes < end);
    }

    /** 模型对应的高峰单价；未收录的模型返回 undefined（宁可不显示也不报错价）。 */
    function pricesFor(model) {
      if (typeof model !== 'string' || model === '') return undefined;
      const canonical = MODEL_ALIASES[model] ?? model;
      const peak = PEAK_PRICES[canonical];
      if (peak === undefined) return undefined;
      return { model: canonical, peak };
    }

    /**
     * 把 tokenUsage 投影换算成人民币。
     * cacheWriteTokens 按官方口径并入"缓存未命中输入"计费（DeepSeek 不单列缓存写入费）。
     */
    function costCny(usage, prices, peak) {
      const factor = (peak ? 1 : 0.5) / 1e6;
      const missInput = (usage.uncachedInputTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
      const hitInput = usage.cacheReadTokens ?? 0;
      const output = usage.outputTokens ?? 0;
      const missCost = missInput * prices.cacheMiss * factor;
      const hitCost = hitInput * prices.cacheHit * factor;
      const outputCost = output * prices.output * factor;
      return {
        total: missCost + hitCost + outputCost,
        missInput,
        hitInput,
        output,
        missCost,
        hitCost,
        outputCost,
      };
    }

    /** 人民币展示：大额两位、小额三到四位，极小值用下界符号。 */
    function formatCny(value) {
      if (!Number.isFinite(value) || value <= 0) return '0';
      if (value >= 1) return value.toFixed(2);
      if (value >= 0.01) return value.toFixed(3);
      const fixed = value.toFixed(4);
      return fixed === '0.0000' ? '<0.0001' : fixed;
    }

    const thousand = (value) => value.toLocaleString('zh-CN');

    /**
     * 输入框下方的那颗成本徽标：整条聊天累计的 token × 当前模型单价。
     * 只读 tokenUsage / modelSelection 两个既有投影，自身不产生任何请求。
     */
    function CnyCostPill(props) {
      const useProjection = props.useProjection;
      const hasHook = typeof useProjection === 'function';
      const rawUsage = hasHook ? useProjection('tokenUsage') : undefined;
      const selection = hasHook ? useProjection('modelSelection') : undefined;
      const [now, setNow] = React.useState(() => Date.now());

      React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => clearInterval(timer);
      }, []);

      // 诊断占位：拿不到数据时显示短标记而不是静默消失，用来区分"插件没被加载"
      // 与"加载了但数据缺失"。稳定后把 DIAGNOSTIC 设为 false 即可隐藏占位。
      const marker = (text, title) => h(
        'span',
        {
          'data-dsh-cny-cost': 'placeholder',
          title,
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: '12px',
            lineHeight: '20px',
            color: 'var(--dsw-alias-label-tertiary, #8a8f98)',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            borderBottom: '1px dashed currentColor',
          },
        },
        text,
      );
      const pending = (text, title) => (DIAGNOSTIC ? marker(text, title) : null);

      if (!hasHook) return pending('¥?', 'dsh-deepseek-cny-cost：插槽没有提供 useProjection');
      // 客户端面拿到的是 wire view（扁平 totals）；这里兼容包了一层的形状。
      const usage = rawUsage !== null && typeof rawUsage === 'object' && rawUsage.totals !== undefined
        ? rawUsage.totals
        : rawUsage;
      if (usage === undefined) return pending('≈¥—', 'dsh-deepseek-cny-cost：尚未拿到 tokenUsage 投影');

      const chosen = selection?.next ?? selection?.lastUsed;
      if (!isDeepSeekProvider(chosen?.provider)) {
        return pending('¥—', `dsh-deepseek-cny-cost：provider 不是 DeepSeek（${chosen?.provider ?? '未知'}）`);
      }
      const prices = pricesFor(chosen?.model);
      if (prices === undefined) {
        return pending('¥—', `dsh-deepseek-cny-cost：未收录的模型（${chosen?.model ?? '未知'}）`);
      }

      const peak = isPeak(beijingParts(new Date(now)));
      const cost = costCny(usage, prices.peak, peak);
      if (cost.total <= 0) return pending('≈¥0', 'dsh-deepseek-cny-cost：这条聊天还没有计费用量');

      const money = `¥${formatCny(cost.total)}`;
      const period = peak ? '高峰价' : '空闲半价';
      const breakdown = [
        `本聊天累计 ≈ ${money}（${period}，${prices.model}）`,
        '',
        `未命中输入 ${thousand(cost.missInput)} tokens · ¥${formatCny(cost.missCost)}`,
        `缓存命中 ${thousand(cost.hitInput)} tokens · ¥${formatCny(cost.hitCost)}`,
        `输出 ${thousand(cost.output)} tokens · ¥${formatCny(cost.outputCost)}`,
        '',
        '按官方公开单价估算，不含搜索/抓取等按次计费项；整条聊天若换过模型，单价取当前模型。',
      ].join('\n');

      return h(
        'span',
        {
          'data-dsh-cny-cost': true,
          'aria-label': `本聊天预估花费 ${money}，${period}`,
          title: breakdown,
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            fontSize: '12px',
            lineHeight: '20px',
            color: 'var(--dsw-alias-label-tertiary, #8a8f98)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          },
        },
        `≈${money}`,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // 位置：输入框工具行、模型名左侧（与 offpeak 圆点同一个槽位，
        // conversation.input.right 正好渲染在 conversation.input.model 之前）。
        ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right',
          id: 'cny-cost',
          order: 1,
        }, CnyCostPill));
      },
      // 仅给 tools/test-cny-cost.mjs 使用；DSH 只关心 inject / apply。
      __test: { beijingParts, isPeak, pricesFor, costCny, formatCny, PEAK_PRICES, BUILTIN_HOLIDAYS },
    };
  },
});
