/**
 * 事件信封：每条上报都要带的那几格（frontend-monitoring.md 契约第 1、5 条）。
 *
 * 这个文件只放**纯函数**——不碰 window、不碰 sessionStorage、不碰网络。理由与
 * `perf/README` 那条口径同源：信封形状是「第一条上报之前定死」的东西，一旦开始收数据
 * 就改不动了（历史数据按老 schema 存着），所以它必须是能单测的一块纯逻辑，而不是散在
 * 上报代码里的一串对象字面量。浏览器侧的采集在 `transport.ts` 与 `index.ts`。
 *
 * 字段分三组，各有硬约束：
 * - 定位（app / version / env）：与后端信封同名（GEN-48），前后端按同一套字段检索
 * - 会话（session_id / route / ts）：session 与 route 的取法见下
 * - 归档（schema / sample_rate）：schema 是信封版本，sample_rate 记**上报当时**的采样率
 */

/**
 * 信封版本。字段增删或语义变化都要 +1，并且与接收端协商好：改版之后老数据还按老 schema 查。
 * 定死成字符串联合而不是 number，编译期就把「拼错版本号」挡掉。
 */
export type EnvelopeSchema = "shop.fe.v1"

/** 三端标识：跟 apps/* 目录名一一对应。`app` 进了指标标签，所以只许这三个值，不许自由串 */
export type AppName = "web" | "seller" | "admin"

/** 设备维度：只取这几个粗粒度字段，够回答「是不是某个浏览器版本普遍坏」就够，不采 UA 原文 */
export interface DeviceInfo {
    /** 浏览器与版本（`navigator.userAgent` 解析出的大类，不带完整 UA 串） */
    browser: string
    /** 设备类型粗分：这三档足够区分「移动端问题」与「桌面端问题」 */
    deviceType: "mobile" | "tablet" | "desktop"
    /** 屏幕短边 CSS 像素：分档上报原始尺寸（指标标签基数可控，明细里查精确值） */
    screen: string
}

export interface Envelope {
    /** 信封版本。接收端按它选解析器——这是「以后加字段不破坏存量」的唯一办法 */
    schema: EnvelopeSchema
    /** 哪一端 */
    app: AppName
    /** 构建标识，必须能定位到一次构建（后端信封同名，GEN-48） */
    version: string
    /** 真实环境。带错信封的历史日志事后改不回来，所以别用默认值糊 */
    env: string
    /** 会话：标签页首次加载时生成、存 sessionStorage——刷新不变，新标签页换新 */
    sessionId: string
    /** 已登录时的用户 id；未登录留空（它是标签，不能塞进指标标签，只能进明细字段） */
    userId?: string
    /** 路由**模板**（保留 `$id` 这类占位），不取实际 URL：实际 URL 带用户数据且基数无界 */
    route: string
    /** 事件时刻（epoch 毫秒）。接收端以此为准，不信任发送时刻（设备时钟可能不准） */
    ts: number
    device: DeviceInfo
    /** 上报当时的采样率：以后调了采样，历史数据仍能按比例还原成真实量 */
    sampleRate: number
}

/** 面包屑：随错误一起上报的最近现场。存内存，刷新即丢（不写 localStorage——那是持久化个人数据） */
export interface Breadcrumb {
    /** 什么时候发生的（epoch 毫秒） */
    ts: number
    /** 粗分类，聚合时按它归组 */
    category: "click" | "route" | "api" | "console" | "custom"
    /** 短描述。**不许放输入内容**：见契约第 5 条的隐私边界 */
    message: string
}

/** 错误事件：信封 + 错误形状 + 现场 */
export interface MonitorErrorEvent extends Envelope {
    kind: "error"
    /** 事件名（受控枚举，不要用动态串——它会变成指标标签） */
    name: string
    message: string
    /** 错误栈。生产环境能还原到源码靠 sourcemap（契约第 4 条），所以它必须带 */
    stack?: string
    /** 接口类事件带它，一跳到后端日志的 trace_id（契约第 2 条） */
    requestId?: string
    /** 归一化后的指纹：接收端按它聚合成「一个问题」（见 fingerprint） */
    fingerprint?: string
    breadcrumbs: Breadcrumb[]
}

/** 性能事件：Web Vitals 与产物体积那类指标共用 */
export interface MonitorPerformanceEvent extends Envelope {
    kind: "performance"
    /** 指标名：LCP / CLS / INP / TTFB…… 受控枚举 */
    name: string
    /** 指标值。毫秒或无量纲，取决于 name——由接收端那张表定义，不在这里猜 */
    value: number
    /** 路由模板，附在信封之外便于按页聚合（信封里已有 route，这份留给指标维度用） */
}

/** 接口事件：失败全报，成功按采样报（首批功能「接口」条） */
export interface MonitorApiEvent extends Envelope {
    kind: "api"
    /** 路由模板，不是实际 URL（实际 URL 含用户数据） */
    endpoint: string
    method: string
    /** 真实状态码。网络层失败是 0——它与 4xx 不是一回事，接收端要分开看 */
    status: number
    /** 耗时（毫秒） */
    duration: number
    /** 失败时的错误摘要。契约第 5 条：不采请求体，只记形态 */
    message?: string
    /** 与后端日志对齐的 trace_id */
    requestId?: string
}

/** 路由事件：PV。它是错误率与白屏率的分母 */
export interface MonitorRouteEvent extends Envelope {
    kind: "route"
    /** 本次路由的模板 */
    to: string
    /** 停留多久离开（毫秒）。没有它就只有「来了多少人」，没有「粘不粘」 */
    duration?: number
}

/**
 * 文案兜底事件：一条用户可见的错误**没有可用的 code**，句子只能由后端 `detail`（中文界面）
 * 或按状态码的通用句给出（i18n.md §7.3 那五支里的 ③ 与 ⑤）。
 *
 * <p>它是「按频次把兜底句升成 code」唯一的数据源（error-codes.md 判据的第二半），
 * 所以**故意不走 `captureError`**，理由两条都在 `captureError` 身上：
 *
 * <ul>
 *   <li>它按指纹限次（同一会话同一错误最多 3 条）。这条信号的全部价值就是**频次**，
 *       限次等于把数据集砍在 3 上——「撞过几次才值得升成 code」就无从判断；
 *   <li>它的指纹还会把数字归一化掉，`status=401` 与 `status=409` 会塌成同一个键。
 * </ul>
 *
 * <p>字段必须是结构化的：它曾经把 `source` / `status` / `code` 拼进 `message` 的自由文本里，
 * 而这三个值正是这条信号的全部内容——接收端只能正则捞，也就没法当维度聚合。
 */
export interface MonitorFallbackEvent extends Envelope {
    kind: "fallback"
    /** 这句文案是从哪一支取到的：`detail` = 中文界面用后端那句；`status` = 按状态码的通用句 */
    source: "detail" | "status"
    /** 当时的 HTTP 状态码。0 表示网络层失败，与 4xx 不是一回事，接收端要分开看 */
    status: number
    /** 当时手上的 code。**可选**：`status` 那一支的定义就是「码没命中」；但 `detail` 那一支
     *  可能是「码登记了、catalog 句子的槽位却没填满」——那种也是要收拢的信号，所以码仍在 */
    code?: string
    /**
     * 当时后端给的那句 `detail`（超长截断）。**它是这条信号唯一能指认「是哪句话」的字段**：
     * `source=status` 时 code 本来就缺席，只靠 `(source, status)` 分不出「404 的 78 句里是哪一句」，
     * 而升级恰恰要落到某一句话上。
     *
     * <p>它进的是**日志字段**而不是指标标签（标签只许有界枚举，句子天然无界）；
     * 这与 `detail` 既有的定位一致——中文界面它是文案，其它语种它本来就是日志字段。
     */
    detail?: string
}

/** 所有事件联合。传输层只认这个形状，接收端按 kind 分流 */
export type MonitoringEvent =
    | MonitorErrorEvent
    | MonitorPerformanceEvent
    | MonitorApiEvent
    | MonitorRouteEvent
    | MonitorFallbackEvent

/**
 * 路由模板化：把实际路径换成带 `$param` 的模板。
 *
 * 为什么必须模板化：`/products/12345` 每个商品一条路径，进指标标签就是无界基数
 * （Prometheus 会直接被撑爆，检索也没法聚合）。模板化后同一个页面永远同一个串。
 *
 * `params` 传**路径段的真实值到参数名的映射**（router 的 `params` 对象就是它），
 * 而不是参数名列表——参数名列表没法定位：看到 `/orders/abc123` 时，光知道「有个叫
 * orderId 的参数」并不能推出它在第几段。按值反查才准。
 *
 * 三条规则叠加：
 * - 命中 params 值的段 → 换成 `$参数名`（最精确，优先）
 * - 剩下的**纯数字**段 → 换成 `$id`（商品 id 这类必然是数字的，省掉调用方的活）
 * - 其余原样保留：宁可模板化得不完美（有界性靠调用方把参数传全），也不要猜错——
 *   把 `/user/settings` 误改成 `/user/$1` 不会丢数据，但把用户的 slug 段留在模板里
 *   会让基数按用户数涨
 *
 * 按**整段**查表而不是字符串替换：路径已按 `/` 拆成段，比对是整段相等。
 * 用 `replace` 那种子串替换才会出 `/orders/$id345`（值 `12` 打断 `123`）的乱模板，
 * 而它恰恰是那种「看起来正常、只是聚合不出来」的错误。
 */
export function toRouteTemplate(
    pathname: string,
    params: Record<string, string | number> = {},
): string {
    const named = new Map(
        Object.entries(params)
            .filter(([, value]) => String(value).length > 0)
            .map(([name, value]) => [String(value), name]),
    )
    const segments = pathname.split("/").filter((segment) => segment.length > 0)
    return (
        "/" +
        segments
            .map((segment) => {
                const name = named.get(segment)
                if (name) return `$${name}`
                if (/^\d+$/.test(segment)) return "$id"
                return segment
            })
            .join("/")
    )
}

/**
 * 错误指纹：接收端聚合用的键（首批「聚合」条——sourcemap 还原后按「归一化 message +
 * 栈顶几帧」算指纹，按影响用户数排序，不按次数）。
 *
 * 只取**栈顶几帧**而不是全栈：深层的业务调用帧在同一处故障下每次都一样，帧数越多
 * 越容易被无关的包装层（不同的 async 边界）打散，聚不出「一个问题」。
 *
 * 归一化 message：把数字与 UUID 抹掉——同一个 bug 每次报出来的 id 不同（订单号、金额），
 * 不抹的话每个 id 都是一个「新问题」，聚合出来是一千条噪声。
 */
export function fingerprint(message: string, stack: string | undefined): string {
    const normalized = message.replace(/\d+|[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "#")
    const topFrames = (stack ?? "")
        .split("\n")
        .slice(1, 4) // 第 0 行是 "Error: message"，帧从第 1 行起
        .map((frame) =>
            frame
                .trim()
                .replace(/\(.*\)/, "")
                .trim(),
        ) // 去掉 (行:列) —— 行号每次构建都变
        .filter((frame) => frame.length > 0)
        .join("|")
    return `${normalized}::${topFrames}`
}

/**
 * 设备维度：只解析出粗粒度三格，不上报完整 UA 串。
 *
 * 为什么不发完整 UA：它是高基数字符串（每个浏览器小版本一条），进明细会把存储打贵，
 * 而回答「是不是某个浏览器版本普遍坏」只需要浏览器 + 版本这一格。
 */
const BROWSER_PATTERNS: readonly (readonly [string, RegExp])[] = [
    // 顺序即优先级：Edge 的 UA 里含 Chrome、Safari 的 UA 里含 Chrome，
    // 排在前面的先匹配上，Chrome 那个兜底分支就只会命中真的 Chrome
    ["edge", /Edg\/(\d+)/],
    ["firefox", /Firefox\/(\d+)/],
    ["chrome", /Chrome\/(\d+)/],
    ["safari", /Safari\/(\d+)/],
]

export function deviceInfo(
    nav: { userAgent: string; maxTouchPoints: number },
    width: number,
    height: number,
): DeviceInfo {
    const ua = nav.userAgent
    let browser = "unknown"
    for (const [name, pattern] of BROWSER_PATTERNS) {
        const matched = pattern.exec(ua)
        if (matched) {
            browser = `${name} ${matched[1]}`
            break
        }
    }
    const minSide = Math.min(width, height)
    const deviceType =
        nav.maxTouchPoints > 0 && minSide < 768 ? "mobile" : minSide < 1024 ? "tablet" : "desktop"
    return { browser, deviceType, screen: `${width}x${height}` }
}
