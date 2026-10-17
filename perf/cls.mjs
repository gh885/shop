#!/usr/bin/env node
/**
 * CLS 归因：一次带时间戳的 layout-shift trace。
 *
 * 回答的问题只有一个：**「这一跳位移发生在什么时候、把谁推走了、推它的那次变化是哪一条」**。
 * Lighthouse 只给一个 0.226 的总分和一个「位移节点」，既不告诉你时刻、也不告诉你因果，
 * 于是优化只能靠猜（`docs/conventions/frontend.md`「打包体积」那条同一口径：先量后改）。
 * 这个脚本把 `layout-shift` 的 `sources[]`（previousRect / currentRect）、发生时刻、同一子树里前后的
 * DOM 变化（插入节点的 rect 与高度）、CSSOM 规则数采样、以及位移节点自己的逐帧矩形串成一条时间线。
 * 三层是必要的：「插了东西」MutationObserver 看得见，「样式后到」只有 CSSOM 采样看得见，
 * 而「DOM 和样式表都没变、宽度却从 48 跳到 412」——几何是内容固有尺寸给的——只能靠掐请求的 A/B。
 * 逐帧矩形负责的是另一件事：把「一次跳变」和「动画在改几何」分开。它是从第一条位移之后才挂上节点的，
 * 所以别指望它描述首次位移的那一刻（那一刻的前后两个矩形在 previousRect / currentRect 里）。
 *
 * 口径与 `pnpm perf` 对齐（这是对得上那个数的前提，不是随手选的参数）：
 * Lighthouse 导航测量默认 `throttlingMethod: "simulate"`——**观测阶段不挂任何限流**，
 * 节流由 Lantern 事后模拟；而 layout-shift 是观测值、模拟不出来。所以这里默认同样
 * **不限流**，只复刻屏幕模拟（`profile.mjs` 从 LHCI 锁定的 Lighthouse 里读，不手抄）。
 * 想复现真机节奏再显式加 `--cpu 4 --net slow4g`，加了之后 CLS 变大是正常的，别再和基线比。
 *
 * 浏览器与页面生命周期交给 Playwright：它已经装好（E2E 同一份 Chromium）、会自己收尾，
 * 也不必再手写一条 CDP WebSocket 会话。
 *
 * 用法：
 *   node perf/cls.mjs http://localhost:4173/ --label home
 *   node perf/cls.mjs http://localhost:4000/audits --preset desktop --label admin-audits
 *   node perf/cls.mjs <url> --cookie refresh_token=xxx@/auth/refresh   # 工作台要登录态
 *   node perf/cls.mjs <url> --cpu 4 --net slow4g --out /tmp/cls.json
 *   node perf/cls.mjs <url> --block picsum.photos                # 因果 A/B：掐掉一类请求再看位移还在不在
 *
 * 是否阻断：不阻断，纯诊断。只有一条会退非 0：页面压根没跑出 trace（Chrome 起不来、URL 不通），
 * 那种情况下打印的是「没测到」而不是「没有位移」——把后者当成前者，就会把假绿读成真修。
 *
 * 服务从哪来：这套量的是**生产构建**，所以要 `vp preview`（或 `pnpm perf` 那套起好的端口）。
 * 在 dev server 上跑等于测另一件事：HMR 客户端会插节点、CSS 是运行时注入的，位移形状完全不同。
 */
import { readFileSync, writeFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { chromium } from "@playwright/test"
import { networkProfile, screenEmulation, userAgents } from "./profile.mjs"

/** 载入后再等的静默期：对齐 lighthouse 的 pauseAfterLoadMs + networkQuietThresholdMs，否则后半段位移会被截掉 */
const DEFAULT_SETTLE_MS = 1500
/** 每条位移往前看多久找因果 */
const CAUSAL_WINDOW_MS = 400
/**
 * 也往后看一点：layout-shift 的 startTime 是**那一帧的开始**，而 MutationObserver 回调跑在同一帧末尾，
 * 于是「因」的时间戳常常比「果」晚 0~10ms。只往前筛会把元凶系统性筛掉（fixture 实测两者同为 414ms，
 * 严格 `m.t <= shift.t` 时那条插入直接消失）。
 */
const CAUSAL_LOOKAHEAD_MS = 50

class TraceFailed extends Error {}

function fail(message) {
    throw new TraceFailed(message)
}

/**
 * 参数解析用 `node:util` 的 parseArgs。它只认结构，报错文本是英文的，所以外面包一层，
 * 让「不认识的参数」这件事仍然说中文。位置参数只允许一个，就是 URL。
 */
function parseCli(argv) {
    let parsed
    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: "boolean", short: "h" },
                label: { type: "string", default: "" },
                preset: { type: "string", default: "mobile" },
                cpu: { type: "string", default: "0" },
                net: { type: "string" },
                wait: { type: "string" },
                out: { type: "string" },
                block: { type: "string", multiple: true, default: [] },
                cookie: { type: "string", multiple: true, default: [] },
            },
        })
    } catch (error) {
        fail(`${error.message}（--help 看用法）`)
    }
    const { values, positionals } = parsed
    if (values.help) return { help: true }
    if (positionals.length > 1) fail(`只能给一个 URL，多出来的是 ${positionals[1]}`)
    if (!positionals[0]) fail("缺 URL（--help 看用法）")
    if (values.preset !== "mobile" && values.preset !== "desktop") {
        fail(`--preset 只认 mobile / desktop，收到 ${values.preset}`)
    }
    if (values.net !== undefined && values.net !== "slow4g") {
        fail("--net 只认 slow4g（默认不限流，与 Lighthouse 观测阶段一致）")
    }
    const cookies = values.cookie.map((raw) => {
        // name=value[@path]：工作台那条 refresh cookie 的 path 是 /auth/refresh，不给就等于没塞
        const eq = raw.indexOf("=")
        if (eq < 0) fail(`--cookie 要 name=value[@path]，收到 ${raw}`)
        const [value, path] = raw.slice(eq + 1).split("@")
        return { name: raw.slice(0, eq), value, path: path || "/" }
    })
    return {
        help: false,
        url: positionals[0],
        label: values.label,
        preset: values.preset,
        cpu: Number(values.cpu),
        net: values.net,
        settle: Number(values.wait ?? DEFAULT_SETTLE_MS),
        out: values.out,
        // 因果 A/B：把某类请求掐掉再跑一次，位移没了就是它推的（* 通配，如 *.picsum.photos/*）
        blocks: values.block,
        cookies,
    }
}

/**
 * 注进页面的一段脚本：document_start 就跑，所以 buffered:true 能把首次绘制之前的位移也捞回来。
 * 写成字符串而不是函数 toString，是为了让 oxfmt 不去动它、也让页内侧不受 node 端词法影响。
 */
const PAGE_SOURCE = `
(function () {
    var S = { shifts: [], muts: [], seq: 0, dropped: 0, css: [], watch: [], rects: [] };
    var MUT_CAP = 4000;

    function clsOf(el) {
        var c = el.className;
        if (typeof c !== 'string') c = (el.getAttribute && el.getAttribute('class')) || '';
        return c.length > 120 ? c.slice(0, 120) + '…' : c;
    }
    function rectOf(r) {
        if (!r) return null;
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }
    /** 稳定可读的定位：标签#id.类/前 5 层，够用且不依赖 CSS Modules 的哈希 */
    function pathOf(el) {
        if (!el || el.nodeType !== 1) return null;
        var parts = [];
        var node = el;
        for (var depth = 0; node && node.nodeType === 1 && depth < 6; depth++) {
            var seg = node.tagName.toLowerCase();
            if (node.id) seg += '#' + node.id;
            var cls = clsOf(node).split(/\\s+/).filter(Boolean).slice(0, 3);
            if (cls.length) seg += '.' + cls.join('.');
            parts.unshift(seg);
            node = node.parentElement;
        }
        return parts.join(' > ');
    }
    function nthAmong(parent, el) {
        if (!parent) return -1;
        var kids = parent.children;
        for (var i = 0; i < kids.length; i++) if (kids[i] === el) return i;
        return -1;
    }
    /** 插入记录用的是「父路径 + 自己」，所以 detail 只补自己那一段，别把父路径抄两遍 */
    function shortOf(el) {
        if (!el || el.nodeType !== 1) return null;
        var seg = el.tagName.toLowerCase();
        if (el.id) seg += '#' + el.id;
        var cls = clsOf(el).split(/\\s+/).filter(Boolean).slice(0, 2);
        if (cls.length) seg += '.' + cls.join('.');
        return seg;
    }
    function describe(node) {
        var el = node ? (node.nodeType === 1 ? node : node.parentElement) : null;
        if (!el) return { tag: node ? '#text(游离)' : '(已脱离文档)', path: null };
        return {
            tag: el.tagName.toLowerCase(),
            path: pathOf(el),
            cls: clsOf(el),
            box: rectOf(el.getBoundingClientRect()),
            index: nthAmong(el.parentElement, el),
            text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50),
        };
    }

    new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var srcs = e.sources || [];
            var out = [];
            for (var j = 0; j < srcs.length; j++) {
                out.push({
                    node: describe(srcs[j].node),
                    prev: rectOf(srcs[j].previousRect),
                    // Chrome 实现的是 currentRect（草案里叫 nextRect）：属性挂在原型上的 getter，
                    // 读错名字不报错、只静默给 undefined，于是每条位移都变成「位移量未知」。
                    current: rectOf(srcs[j].currentRect),
                });
            }
            S.shifts.push({ t: Math.round(e.startTime), value: e.value, excluded: !!e.hadRecentInput, sources: out });
            if (!e.hadRecentInput) watch(srcs);
        }
    }).observe({ type: 'layout-shift', buffered: true });

    /* 逐帧盯住位移节点自己的矩形。位移有两种成因，CLS 总分和 DOM 变化都分不开：
       一种是「某一刻样式/尺寸变了」（一次跳变），一种是「动画或过渡在改几何」（一连串小步）。
       前者要去找那一刻到了什么，后者要去找是谁给它加了过渡——两者修法完全相反。
       只在前 3 个位移节点上开，rAF 采一帧，rect 变了才记一行。 */
    var rafId = 0, watchDone = false;
    function watch(srcs) {
        for (var j = 0; j < srcs.length && S.watch.length < 3; j++) {
            var el = srcs[j].node;
            if (!el || el.nodeType !== 1) continue;
            var seen = false;
            for (var k = 0; k < S.watch.length; k++) if (S.watch[k].el === el) seen = true;
            if (seen) continue;
            // last 用 false 而不是 null 起头：null 是「一个合法矩形」的编码，分不清「还没采过」
            S.watch.push({ el: el, path: pathOf(el), last: false, lastRect: null });
        }
        start();
    }
    function start() {
        if (rafId || watchDone || S.watch.length === 0) return;
        var tick = function () {
            var t = Math.round(performance.now());
            var alive = 0;
            for (var i = 0; i < S.watch.length; i++) {
                var w = S.watch[i];
                if (!w.el.isConnected) continue;
                alive++;
                var r = rectOf(w.el.getBoundingClientRect());
                var key = r ? r.x + '/' + r.y + '/' + r.w + '/' + r.h : 'null';
                if (w.last === false) { w.last = key; w.lastRect = r; continue; }
                if (w.last !== key) {
                    if (S.rects.length < 600) S.rects.push({ t: t, path: w.path, from: w.lastRect, to: r });
                    w.last = key;
                    w.lastRect = r;
                }
            }
            if (t > 8000 || alive === 0) { watchDone = true; return; }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
    }

    var pending = [];
    function record(kind, target, detail, box) {
        if (pending.length > 400) return;
        pending.push({ t: Math.round(performance.now()), kind: kind, path: pathOf(target), cls: clsOf(target), detail: detail, box: box, index: nthAmong(target ? target.parentElement : null, target) });
    }
    function flush() {
        for (var i = 0; i < pending.length && S.muts.length < MUT_CAP; i++) {
            S.muts.push({ id: ++S.seq, t: pending[i].t, kind: pending[i].kind, path: pending[i].path, cls: pending[i].cls, detail: pending[i].detail, box: pending[i].box, index: pending[i].index });
        }
        if (pending.length > 400) S.dropped += pending.length - 400;
        pending = [];
    }
    new MutationObserver(function (recs) {
        for (var i = 0; i < recs.length; i++) {
            var r = recs[i];
            if (r.type === 'childList') {
                for (var a = 0; a < r.addedNodes.length; a++) {
                    var added = r.addedNodes[a];
                    if (added.nodeType !== 1) { record('text+', added.parentNode, (added.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40), null); continue; }
                    record('el+', added, shortOf(added), rectOf(added.getBoundingClientRect()));
                }
                for (var d = 0; d < r.removedNodes.length; d++) {
                    var removed = r.removedNodes[d];
                    if (removed.nodeType === 1) record('el-', removed, pathOf(removed), null);
                }
            } else {
                var el = r.target;
                if (el.nodeType !== 1) el = el.parentElement;
                var after = el ? el.getAttribute(r.attributeName) : null;
                record('attr', el, r.attributeName + '=' + String(after).slice(0, 60), el ? rectOf(el.getBoundingClientRect()) : null);
            }
        }
        Promise.resolve().then(flush);
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'height', 'width'] });

    /* CSSOM 时间线。MutationObserver 看不见「某张外链样式表的规则开始生效」——
       样式表落地、insertRule、adoptedStyleSheets 都不碰 DOM。所以当位移窗口里
       一条 DOM 变化都没有、版心却从 48px 变成 412px 时，只有这一条能答。
       每 50ms 采样一次，只在数字真的变了时记一行（600 条上限是给 CSS-in-JS 留的余地）。 */
    function cssomState() {
        var sheets = document.styleSheets;
        var rules = 0;
        for (var i = 0; i < sheets.length; i++) {
            try { rules += sheets[i].cssRules.length; } catch (err) { rules += 1000; } // 跨源读不到规则，按一份计
        }
        return [sheets.length, rules];
    }
    var cssPrev = null;
    var cssSample = 0;
    var timer = setInterval(function () {
        var state = cssomState();
        var t = Math.round(performance.now());
        cssSample++;
        if ((!cssPrev || cssPrev[1] !== state[1] || cssPrev[0] !== state[0]) && S.css.length < 600) {
            S.css.push({ t: t, sheets: state[0], rules: state[1] });
            cssPrev = [state[0], state[1]];
        }
        if (t > 8000) clearInterval(timer);
    }, 50);

    new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        var last = entries[entries.length - 1];
        if (last) S.lcp = { t: Math.round(last.startTime), size: last.size, path: pathOf(last.element), tag: last.element ? last.element.tagName.toLowerCase() : null };
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    document.fonts.ready.then(function () { S.fontsReady = Math.round(performance.now()); });

    window.__clsCollect = function () {
        flush();
        var nav = performance.getEntriesByType('navigation')[0] || {};
        var paints = {};
        performance.getEntriesByType('paint').forEach(function (p) { paints[p.name] = Math.round(p.startTime); });
        var res = performance.getEntriesByType('resource');
        var isStyle = function (r) { return /\\.(css|woff2?)(\\?|$)/i.test(r.name) || r.initiatorType === 'css' || r.initiatorType === 'font'; };
        // 两类资源都可能把 initiatorType 报成 link：preload 的图片不是样式，归错组会把「图落地」读成
        // 「CSS 后到」。而 picsum 那种 /600/600?imageMogr2… 的 URL 根本没有扩展名，所以只能先认
        // 「是不是样式」，剩下的一律算图。
        var images = res
            .filter(function (r) { return !isStyle(r) && (r.initiatorType === 'img' || r.initiatorType === 'link' || /\\.(png|jpe?g|webp|avif|gif|svg)/i.test(r.name)); })
            .map(function (r) { return { t: Math.round(r.responseEnd), start: Math.round(r.startTime), path: r.name.slice(-70) }; });
        var styles = res
            .filter(isStyle)
            .map(function (r) { return { t: Math.round(r.responseEnd), kind: r.initiatorType, path: r.name.slice(-60) }; });
        clearInterval(timer);
        if (rafId) cancelAnimationFrame(rafId);
        // 位移节点此刻的几何是谁给的：只读那几个能解释「48 → 412」的属性
        var watched = S.watch.map(function (w) {
            var cs = w.el.isConnected ? getComputedStyle(w.el) : null;
            return {
                path: w.path,
                connected: w.el.isConnected,
                css: cs ? { display: cs.display, width: cs.width, maxWidth: cs.maxWidth, marginLeft: cs.marginLeft, marginRight: cs.marginRight, alignSelf: cs.alignSelf, position: cs.position, padding: cs.padding } : null,
                parentCss: cs && w.el.parentElement ? (function (p) { return { display: p.display, alignItems: p.alignItems, width: p.width }; })(getComputedStyle(w.el.parentElement)) : null,
            };
        });
        return JSON.stringify({
            url: location.href,
            viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
            docHeight: document.documentElement.scrollHeight,
            marks: { fcp: paints['first-contentful-paint'] ?? null, fp: paints['first-paint'] ?? null, dcl: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0), interactive: Math.round(nav.domInteractive || 0), fontsReady: S.fontsReady ?? null },
            lcp: S.lcp ?? null,
            shifts: S.shifts,
            muts: S.muts,
            dropped: S.dropped,
            images: images,
            styles: styles,
            css: S.css,
            cssSamples: cssSample,
            rects: S.rects,
            watched: watched,
        });
    };
})();
`

function signed(value) {
    return value > 0 ? `+${value}` : String(value)
}

function boxText(box) {
    if (!box) return "—"
    return `x${box.x} y${box.y} ${box.w}×${box.h}`
}

/** 位移方向读数：纵向位移才谈得上「把内容推走」，横向多半是版心/滚动条 */
function moveText(prev, next) {
    if (!prev || !next) return "位移量未知（rect 缺失）"
    const dy = next.y - prev.y
    const dx = next.x - prev.x
    const dh = next.h - prev.h
    const parts = []
    if (dy !== 0) parts.push(`纵移 ${signed(dy)}px`)
    if (dx !== 0) parts.push(`横移 ${signed(dx)}px`)
    if (dh !== 0) parts.push(`自身高度 ${signed(dh)}px`)
    if (parts.length === 0) parts.push("rect 变了但位置没动")
    return parts.join(" / ")
}

function pathOverlaps(a, b) {
    if (!a || !b) return false
    return a === b || a.startsWith(`${b} > `) || b.startsWith(`${a} > `)
}

function printTrace(trace, opts) {
    const counted = trace.shifts.filter((s) => !s.excluded)
    const total = counted.reduce((sum, s) => sum + s.value, 0)
    const label = opts.label || new URL(trace.url).pathname

    console.log(`\n── CLS trace：${label}  ${trace.url}`)
    console.log(
        `   视口 ${trace.viewport.w}×${trace.viewport.h} DPR${trace.viewport.dpr}` +
            `  限流 ${opts.cpu ? `CPU×${opts.cpu}` : "无"}${opts.net ? ` + ${opts.net}` : ""}` +
            `（Lighthouse 观测阶段不限流，所以默认「无」才对得上它的数）` +
            (opts.blocks.length > 0
                ? `\n   掐掉的请求：${opts.blocks.join("  ")}——这一轮不是基线，是和上一轮做差`
                : ""),
    )
    console.log(
        `   合计 CLS ${total.toFixed(3)}  ← ${counted.length} 条计入` +
            (trace.shifts.length - counted.length > 0
                ? `，${trace.shifts.length - counted.length} 条因 hadRecentInput 被 Chrome 自己排除`
                : ""),
    )
    const marks = trace.marks
    console.log(
        `   时间轴：FP ${marks.fp ?? "—"} / FCP ${marks.fcp ?? "—"} / 可交互 ${marks.interactive ?? "—"} / DCL ${marks.dcl ?? "—"} / load ${marks.load ?? "—"} / 字体就绪 ${marks.fontsReady ?? "—"}`,
    )
    if (trace.lcp) {
        console.log(
            `   LCP @${trace.lcp.t}ms：${trace.lcp.tag} ${trace.lcp.path ?? "(取不到元素)"}（${trace.lcp.size}px²）`,
        )
    }
    if (trace.styles.length > 0) {
        console.log(
            `   样式/字体资源落地：${trace.styles.map((s) => `${s.t}ms ${s.kind} ${s.path}`).join("   ") || "（没有外链样式：全内联或随 JS）"}`,
        )
    }
    if (trace.css.length > 0) {
        console.log(
            `   CSSOM（sheet 数/规则数 的变化）：${trace.css.map((c) => `${c.t}ms ${c.sheets}/${c.rules}`).join("  →  ")}`,
        )
    }
    const seenPath = new Set()
    for (const w of trace.watched ?? []) {
        if (!w.css || seenPath.has(w.path)) continue
        seenPath.add(w.path)
        console.log(
            `   位移节点此刻 ${w.path ?? "(已脱离)"}：display=${w.css.display} width=${w.css.width} max-width=${w.css.maxWidth} margin=${w.css.marginLeft}/${w.css.marginRight} align-self=${w.css.alignSelf} position=${w.css.position} padding=${w.css.padding}` +
                (w.parentCss
                    ? `  ｜父：display=${w.parentCss.display} align-items=${w.parentCss.alignItems} width=${w.parentCss.width}`
                    : ""),
        )
    }
    if (trace.dropped > 0)
        console.log(
            `   注：DOM 变化超出单帧上限，丢了 ${trace.dropped} 条（--wait 调大或页面本身在动）`,
        )

    if (counted.length === 0) {
        console.log(
            `\n   这次没测到计入的位移——是「这次没复现」，不等于「没有」。多跑几轮，或 --cpu 4 逼出竞态。`,
        )
        return
    }

    for (const [i, shift] of counted.toSorted((a, b) => a.value - b.value).entries()) {
        console.log(
            `\n▌#${i + 1}  t=${shift.t}ms  贡献 ${shift.value.toFixed(4)}` +
                `  （占合计 ${((shift.value / total) * 100).toFixed(0)}%）`,
        )
        for (const source of shift.sources) {
            console.log(`    位移节点 ${source.node.tag}  [${source.node.path ?? "(游离)"}]`)
            console.log(
                `      prev ${boxText(source.prev)} → current ${boxText(source.current)}   ${moveText(source.prev, source.current)}`,
            )
            if (source.node.text) console.log(`      内容「${source.node.text}」`)
        }
        const anchor = shift.sources[0]?.node.path
        const olds = shift.sources.map((s) => s.prev).filter(Boolean)
        // 能把内容推下去的只有两种：位移节点自己子树里的变化，或插在它「上方」的新节点
        // （新节点自己的顶边比位移节点的旧顶边更高，才可能把它推下去）。
        // 不这么筛的话，一屏 hydration 的插入会全涌进来，看不出因果。
        const causal = trace.muts.filter((m) => {
            if (m.t > shift.t + CAUSAL_LOOKAHEAD_MS || m.t < shift.t - CAUSAL_WINDOW_MS)
                return false
            if (pathOverlaps(m.path, anchor)) return true
            if (m.kind !== "el+") return false
            // head 里插的 link / style / meta 没有几何可言（rect 恒为 0），但「body 一条变化都没有
            // 却突然重新排版」的元凶恰恰通常是它们——贴着位移时刻的那些必须留下来。
            if (!m.box || m.box.h === 0) return m.t >= shift.t - 20
            return olds.some((prev) => m.box.y < prev.y)
        })
        console.log(`    前 ${CAUSAL_WINDOW_MS}ms 内相关 DOM 变化（${causal.length} 条，按时间）：`)
        for (const m of causal.slice(0, 10)) {
            const box = m.box ? `  ${boxText(m.box)}` : ""
            console.log(
                `      ${String(m.t).padStart(6)}ms  ${m.kind}  ${m.path ?? "(无父元素)"}  ${m.detail ?? ""}${box}`,
            )
        }
        if (causal.length > 10)
            console.log(`      …还有 ${causal.length - 10} 条，看 --out 的 JSON`)
        const inserts = causal.filter((m) => m.kind === "el+" && m.box && m.box.h > 0)
        if (inserts.length > 0) {
            const tallest = inserts.toSorted((a, b) => b.box.h - a.box.h)[0]
            console.log(
                `    最像元凶的一条：t=${tallest.t}ms 插入 ${tallest.path}，高 ${tallest.box.h}px，在它前面第 ${tallest.index} 个位置`,
            )
        }
        // 只有 ±150ms 内的规则数变化才谈得上「样式后到解释了这次位移」；
        // 放宽到 400ms 窗口会把「早已落地的首屏样式」也报成元凶（fixture 实测踩过）。
        const cssNear = trace.css.filter((c) => Math.abs(c.t - shift.t) <= 150)
        const cssBefore = trace.css.findLast((c) => c.t <= shift.t + CAUSAL_LOOKAHEAD_MS)
        if (cssNear.length > 0 || causal.length === 0) {
            console.log(
                `    CSSOM：` +
                    (cssNear.length > 0
                        ? `位移 ±150ms 内有 ${cssNear.length} 次变化（${cssNear.map((c) => `${c.t}ms ${c.sheets}张/${c.rules}条`).join(" → ")}）——样式后到可以单独解释这次位移`
                        : `位移 ±150ms 内没变化` +
                          (cssBefore ? `，最后一次在 ${cssBefore.t}ms` : "") +
                          (causal.length === 0
                              ? "；DOM 也没变化 ⇒ 既不是插内容也不是样式后到，看逐帧矩形"
                              : "")),
            )
        }
        // 逐帧矩形：DOM 变化和 CSSOM 计数都看不见「同一份样式下几何被改」，这一条能。
        // 只取这一条位移前后——把两条不相干位移的步数并在一起数，会得出「有动画」的假结论。
        const around = (trace.rects ?? []).filter(
            (r) => pathOverlaps(r.path, anchor) && r.t >= shift.t - 80 && r.t <= shift.t + 150,
        )
        if (around.length > 0) {
            console.log(
                `    该节点矩形逐帧（前后 80/150ms，${around.length} 步）：${around
                    .slice(0, 8)
                    .map(
                        (r) =>
                            `${r.t}ms ${r.from ? `${r.from.w}×${r.from.h}@y${r.from.y}` : "—"}→${r.to ? `${r.to.w}×${r.to.h}@y${r.to.y}` : "—"}`,
                    )
                    .join("  ")}`,
            )
            console.log(
                around.length > 2
                    ? `      一连串小步 = 过渡/动画在改几何（找它的 transition 或 keyframes），和「谁插了东西」无关`
                    : `      一次跳变 = 那一帧样式或尺寸变了，对齐 CSSOM / 资源时间线找同一时刻`,
            )
        }
    }

    const lateImages = trace.images.filter(
        (img) => img.t > (trace.marks.fcp ?? 0) && img.t >= minShiftTime(counted),
    )
    if (lateImages.length > 0) {
        console.log(`\n   首次位移之后才落地的图片（没钉住尺寸的图就是这一类）：`)
        for (const img of lateImages.slice(0, 8))
            console.log(`      ${String(img.t).padStart(6)}ms  ${img.path}`)
    }
}

function minShiftTime(shifts) {
    return shifts.reduce((min, s) => Math.min(min, s.t), Number.POSITIVE_INFINITY)
}

async function collectTrace(options) {
    const screen = screenEmulation[options.preset]
    const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] })
    try {
        const context = await browser.newContext({
            viewport: { width: screen.width, height: screen.height },
            deviceScaleFactor: screen.deviceScaleFactor,
            isMobile: screen.mobile,
            hasTouch: screen.mobile,
            userAgent: userAgents[options.preset],
        })
        // Playwright 的 cookie 用 domain（不是 url）才留得住 path=/auth/refresh 这一条
        await context.addCookies(
            options.cookies.map((cookie) => ({
                name: cookie.name,
                value: cookie.value,
                domain: new URL(options.url).hostname,
                path: cookie.path,
                httpOnly: true,
                secure: false,
                sameSite: "Lax",
            })),
        )
        const page = await context.newPage()
        // CPU / 网络限流只有 CDP 有；Playwright 已把这条会话递过来了，不必自己连 WebSocket
        const session = await context.newCDPSession(page)
        if (options.cpu > 0) {
            await session.send("Emulation.setCPUThrottlingRate", { rate: options.cpu })
        }
        if (options.net === "slow4g") {
            await session.send("Network.emulateNetworkConditions", {
                offline: false,
                ...networkProfile("mobileSlow4G"),
            })
        }
        if (options.blocks.length > 0) {
            // Playwright 的 route 比 CDP 的 urlPattern 可靠：它按请求实际 URL 判，通配符不用自己拼
            await page.route("**/*", (route) => {
                const url = route.request().url()
                const blocked = options.blocks.some((pattern) =>
                    url.includes(pattern.replaceAll("*", "")),
                )
                return blocked ? route.abort("blockedbyclient") : route.continue()
            })
        }
        await page.addInitScript({ content: PAGE_SOURCE })
        try {
            await page.goto(options.url, { waitUntil: "load", timeout: 15_000 })
        } catch (error) {
            fail(`15s 内没有 load 事件：${options.url}（${error.message}）`)
        }
        await page.waitForTimeout(options.settle)
        const collected = await page.evaluate(() => globalThis["__clsCollect"]?.())
        if (!collected) {
            fail(
                "采不到 trace：注入脚本在当前文档里不存在（多半是跳转换了文档，或用 --preset 对着的其实是别端）",
            )
        }
        return JSON.parse(collected)
    } finally {
        await browser.close()
    }
}

async function main() {
    const options = parseCli(process.argv.slice(2))
    if (options.help) {
        console.log(
            readFileSync(new URL(import.meta.url), "utf8")
                .split("\n")
                .filter((line) => line.startsWith(" *"))
                .join("\n")
                .replaceAll(/^ \* ?/gm, ""),
        )
        return
    }

    const data = await collectTrace(options)
    printTrace(data, options)
    if (options.out) {
        writeFileSync(options.out, `${JSON.stringify(data, null, 2)}\n`)
        console.log(`\n   原始 trace 已落 ${options.out}`)
    }
    console.log(
        `\n读法：按 ▌ 的贡献占比排，只看最大的那条。「最像元凶」是猜测不是结论——` +
            `它取「窗口内顶边高于位移节点旧顶边、插进来最高的那个节点」，钉死它还要看那个节点的高度是谁给的` +
            `（骨架没占位？图没钉尺寸？CSS 后到？）。位移只在 FCP 之后才计入 CLS，所以时间轴那行的 FCP 决定了上面会出现哪几条。`,
    )
}

try {
    await main()
} catch (error) {
    if (error instanceof TraceFailed) {
        console.error(`[cls] ${error.message}`)
    } else {
        console.error(`[cls] trace 中断：${error.message}`)
    }
    process.exitCode = 1
}
