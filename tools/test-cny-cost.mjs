// Regression test for the dsh-deepseek-cny-cost client bundle.
// The browser bundle is a classic script, so it is evaluated here with a fake
// `window.__ModuleLoader__` and a fake `react`; no DSH runtime is involved.
// Run: node tools/test-cny-cost.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

let captured
const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useSyncExternalStore: (_sub, get) => get(),
}

new Function('window', source)({
  __ModuleLoader__: { load: (config) => { captured = config } },
})

if (!captured) throw new Error('module loader was never called')
if (captured.id !== 'dsh-deepseek-cny-cost') throw new Error(`unexpected id: ${captured.id}`)
const plugin = captured.factory((name) => {
  if (name === 'react') return fakeReact
  throw new Error(`unexpected require: ${name}`)
})
const { beijingParts, isPeak, pricesFor, costCny, formatCny } = plugin.__test

let passed = 0
const failures = []
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) passed += 1
  else failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

// ── 时段判定 ───────────────────────────────────────────────────────────────
const at = (iso) => beijingParts(new Date(iso))
check('周二 10:00 高峰', isPeak(at('2026-10-20T10:00:00+08:00')), true)
check('周二 09:00 整点进高峰', isPeak(at('2026-10-20T09:00:00+08:00')), true)
check('周二 12:00 整点转空闲', isPeak(at('2026-10-20T12:00:00+08:00')), false)
check('周二 14:00 整点回高峰', isPeak(at('2026-10-20T14:00:00+08:00')), true)
check('周二 18:00 整点转空闲', isPeak(at('2026-10-20T18:00:00+08:00')), false)
check('周六 10:00 空闲', isPeak(at('2026-10-17T10:00:00+08:00')), false)
check('周四 10:00 但国庆假期 → 空闲', isPeak(at('2026-10-01T10:00:00+08:00')), false)
check('北京时区口径（本机时区无关）', at('2026-10-20T02:00:00Z').minutes, 600)

// ── 单价表 ─────────────────────────────────────────────────────────────────
check('flash 高峰未命中价', pricesFor('deepseek-flash').peak.cacheMiss, 2)
check('flash 高峰输出价', pricesFor('deepseek-flash').peak.output, 8)
check('pro 高峰未命中价', pricesFor('deepseek-v4-pro').peak.cacheMiss, 9)
check('旧模型名归并到 flash', pricesFor('deepseek-v4-flash').model, 'deepseek-flash')
check('未知模型不报价', pricesFor('gpt-5'), undefined)
check('空模型名不报价', pricesFor(''), undefined)

// ── 计价 ───────────────────────────────────────────────────────────────────
const flash = pricesFor('deepseek-flash').peak
const cost1 = costCny({ uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, flash, true)
check('100 万未命中输入 @高峰 = ¥2', Number(cost1.total.toFixed(6)), 2)
const cost2 = costCny({ uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, flash, false)
check('同量 @空闲 = ¥1（半价）', Number(cost2.total.toFixed(6)), 1)
const cost3 = costCny({ uncachedInputTokens: 0, outputTokens: 5e5, cacheReadTokens: 2e6, cacheWriteTokens: 0 }, flash, true)
check('50 万输出 + 200 万命中输入 @高峰 = ¥4.08', Number(cost3.total.toFixed(6)), 4.08)
const cost4 = costCny({ uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 1e6 }, flash, true)
check('缓存写入并入未命中输入', cost4.missInput, 2e6)
const cost5 = costCny({}, flash, true)
check('空用量为 0', cost5.total, 0)

// ── 展示 ───────────────────────────────────────────────────────────────────
check('零值', formatCny(0), '0')
check('大额两位', formatCny(12.3456), '12.35')
check('中等三位', formatCny(0.0234), '0.023')
check('小额四位', formatCny(0.0042), '0.0042')
check('极小值下界', formatCny(0.000001), '<0.0001')

// ── 槽位注册 ───────────────────────────────────────────────────────────────
let registered
plugin.apply({
  slots: {
    inject: (name, fn) => { check('槽位名', name, 'conversation.input.right'); fn() },
    register: (entry, component) => { registered = { entry, component } },
  },
})
check('条目 id', registered.entry.id, 'cny-cost')
check('条目 order', registered.entry.order, 1)
check('条目槽位', registered.entry.name, 'conversation.input.right')

// ── 组件行为 ───────────────────────────────────────────────────────────────
const usage = { uncachedInputTokens: 0, outputTokens: 1e6, cacheReadTokens: 0, cacheWriteTokens: 0 }
const projections = {
  tokenUsage: usage,
  modelSelection: { lastUsed: { provider: 'deepseek-official', model: 'deepseek-flash' } },
}
const element = registered.component({ useProjection: (key) => projections[key] })
const text = element.children.join('')
check('组件渲染金额', /^≈¥\d/.test(text), true)
check('无障碍标签含预估花费', element.props['aria-label'].startsWith('本聊天预估花费'), true)
check('提示含明细', element.props.title.includes('缓存命中'), true)

// 形状兼容：wire view 是扁平 totals，也接受包了一层的 { totals }
check('包一层的 totals 也认', registered.component({
  useProjection: (key) => key === 'tokenUsage'
    ? { totals: usage, last: null }
    : { lastUsed: { provider: 'deepseek-official', model: 'deepseek-flash' } },
}).children.join(''), text)

// 诊断占位：这几种情况不静默消失，而是给出可辨识的标记
const markerText = (el) => (el === null ? 'null' : el.children.join(''))
check('缺投影钩子 → ¥?', markerText(registered.component({})), '¥?')
check('缺 tokenUsage → ≈¥—', markerText(registered.component({ useProjection: (key) => (key === 'modelSelection'
  ? { lastUsed: { provider: 'deepseek-official', model: 'deepseek-flash' } }
  : undefined) })), '≈¥—')
check('第三方 provider → ¥—', markerText(registered.component({
  useProjection: (key) => key === 'tokenUsage'
    ? usage
    : { lastUsed: { provider: 'openrouter', model: 'deepseek-flash' } },
})), '¥—')
check('未知模型 → ¥—', markerText(registered.component({
  useProjection: (key) => key === 'tokenUsage'
    ? usage
    : { lastUsed: { provider: 'deepseek-official', model: 'some-future-model' } },
})), '¥—')
check('零用量 → ≈¥0', markerText(registered.component({
  useProjection: (key) => key === 'tokenUsage'
    ? { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
    : { lastUsed: { provider: 'deepseek-official', model: 'deepseek-flash' } },
})), '≈¥0')

if (failures.length > 0) {
  console.error(`${failures.length} 项失败：`)
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  process.exit(1)
}
console.log(`全部通过（${passed} 项断言）`)
