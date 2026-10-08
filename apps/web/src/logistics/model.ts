import { isValid } from "date-fns"
import type { WebMessageKey, WebTranslate } from "#/locales/messages.gen"

import { formatDateTime, formatTimeShort } from "@shop/app-kit/display"
import type { AppLocale } from "@shop/common/i18n"
import { isSamePlatformYear } from "@shop/common/i18n"
import type { ShipmentDirection, ShipmentStatus, TrackingNodeCode } from "@shop/api/sdk"

/**
 * logistics 领域层 —— 买家物流页的业务类型 + 纯规则（词表 / 时间文案 / 折叠切分 / 脱敏）。
 *
 * - 本文件（model.ts）：业务类型 + 纯规则，不知道 wire 的一切。
 * - wire 拼接 / 投影在 ./tracking.ts（数据层），从生成 SDK 取，不手写 zod。
 *
 * 词表是纯展示决策，后端只给标准词表（规则见 docs/business-rules/logistics.md LOG-37、LOG-38），
 * 所以「节点码 → 中文名」只在这里有一份，组件不 import SDK 枚举。
 */

// 词表
/**
 * 包裹状态 → 展示名。既做摘要卡大标题，也做轨迹段标题。
 * 刻意粗粒度：到达/离开分拨都归「运输中」——轨迹要细、状态要粗（与后端 TrackingNodeCode.status() 同构）。
 */
export const SHIPMENT_STATUS_KEY: Record<ShipmentStatus, WebLogisticsStatusKey> = {
    PENDING_PICKUP: "logistics.status.PENDING_PICKUP",
    PICKED_UP: "logistics.status.PICKED_UP",
    IN_TRANSIT: "logistics.status.IN_TRANSIT",
    DELIVERING: "logistics.status.DELIVERING",
    DELIVERED: "logistics.status.DELIVERED",
    RETURNED: "logistics.status.RETURNED",
    EXCEPTION: "logistics.status.EXCEPTION",
}

/** 包裹状态 → 展示名（句子在 catalog，这里按 status 取） */
export function shipmentStatusLabel(status: ShipmentStatus, t: WebTranslate): string {
    return t(SHIPMENT_STATUS_KEY[status])
}

/** 节点描述为空时的兜底文案：承运商偶尔只给状态码不给描述，宁可给一句干巴巴的话也不留空行 */
export const TRACKING_NODE_KEY: Record<TrackingNodeCode, WebLogisticsNodeKey> = {
    PICKED_UP: "logistics.node.PICKED_UP",
    ARRIVED_HUB: "logistics.node.ARRIVED_HUB",
    DEPARTED_HUB: "logistics.node.DEPARTED_HUB",
    OUT_FOR_DELIVERY: "logistics.node.OUT_FOR_DELIVERY",
    DELIVERED: "logistics.node.DELIVERED",
    RETURNED: "logistics.node.RETURNED",
    EXCEPTION: "logistics.node.EXCEPTION",
}

/** 节点描述为空时的兜底句（承运商偶尔只给状态码不给描述，宁可给一句干巴巴的话也不留空行） */
export function trackingNodeLabel(nodeCode: TrackingNodeCode, t: WebTranslate): string {
    return t(TRACKING_NODE_KEY[nodeCode])
}

/** 异常段词表：这两段红色分级（签收/退回是终态，退回也算异常语义） */
const ABNORMAL_STATUS: ReadonlySet<ShipmentStatus> = new Set(["EXCEPTION", "RETURNED"])

export function isAbnormalStatus(status: ShipmentStatus): boolean {
    return ABNORMAL_STATUS.has(status)
}

// 业务类型
/** 轨迹节点（视图模型）：时间已格式化、分级已判定，组件拿到即画 */
export type TrackingNode = {
    key: string
    /** 已格式化，如「07-28 11:12」（跨年补年份） */
    time: string
    /** 位置前缀，如「晋中市」；商家侧事件为 null */
    location: string | null
    text: string
    /** 全局最新一条：段首与圆点高亮 */
    latest: boolean
    /** 异常节点：红色分级 */
    abnormal: boolean
}

/** 轨迹段：同一状态下的连续节点。段首带标题，段内是只有时间的续行 */
export type TrackingGroup = {
    key: string
    label: string
    abnormal: boolean
    nodes: TrackingNode[]
}

/** 一个包裹 = 承运商摘要 + 一条轨迹轴 */
export type ShipmentTrack = {
    direction: ShipmentDirection
    carrierName: string
    trackingNo: string
    status: ShipmentStatus
    /** 轨迹轴，新 → 旧 */
    groups: TrackingGroup[]
}

// 纯规则
/**
 * ISO 时间 → 轨迹节点的时间文案。
 * 比 app-kit 的 formatTimeShort 多做一件事：**跨年补年份**——只给月日时，去年 12 月与今年 12 月
 * 在同一条轴上无法区分。形状本身（短时间 / 完整时间）不在这里重写模式串，交给 app-kit 那两处：
 * 抄一份 `MM-dd HH:mm` 的下场是英文站拿到中文站的形状。非法时间原样返回（与展示兜底约定一致）。
 *
 * `locale` 走参数（§3.5 约束 2）：这条投影链（tracking → 页面）全程是纯函数，传得动就不该读上下文。
 *
 * 判「今年」用 `isSamePlatformYear` 而不是 `d.getFullYear() === now.getFullYear()`：后者读的是**环境**
 * 时区，而下面两条输出按平台时区（`Asia/Shanghai`）排——UTC 机器上「今年」与输出会差一年
 * （12/31 的轨迹节点在 UTC 还算去年、按 +08 排出来却是今年）。
 */
export function formatNodeTime(iso: string, locale: AppLocale, now: Date = new Date()): string {
    const d = new Date(iso)
    if (!isValid(d)) return iso
    return isSamePlatformYear(d, now) ? formatTimeShort(iso, locale) : formatDateTime(iso, locale)
}

/** 轴上的节点总数（折叠判定用） */
export function countNodes(groups: TrackingGroup[]): number {
    return groups.reduce((sum, g) => sum + g.nodes.length, 0)
}

/**
 * 折叠：按轴序（新 → 旧）保留最新 maxNodes 条节点，被抽空的段丢弃。
 * 保留段结构而不是摊平——折叠后段首仍要有标题，否则「07-28 15:37」脱离「待取件」就没有意义。
 */
export function sliceGroups(groups: TrackingGroup[], maxNodes: number): TrackingGroup[] {
    const kept: TrackingGroup[] = []
    let budget = maxNodes
    for (const group of groups) {
        if (budget <= 0) break
        const nodes = group.nodes.slice(0, budget)
        budget -= nodes.length
        kept.push({ ...group, nodes })
    }
    return kept
}

/** 标记全局最新一条（轴顶第一个节点）：高亮只能有一处，所以统一在这里判定，分组函数不掺和 */
export function markLatest(groups: TrackingGroup[]): TrackingGroup[] {
    let marked = false
    return groups.map((group) => ({
        ...group,
        nodes: group.nodes.map((node) => {
            if (marked) return node
            marked = true
            return { ...node, latest: true }
        }),
    }))
}

/**
 * 时间轴上的一行 = 一个节点（摊平后记下它是不是段首）。
 *
 * 组件只认 `head` / `label` / `abnormal` 三个已判定的分级，不在渲染里再判一次 `index === 0`——
 * 那等于把「段首是谁」这条规则的第二份答案写进 UI。
 */
export type TimelineRow = {
    node: TrackingNode
    key: string
    /** 段首行：要画段标题；段内续行只有时间 */
    head: boolean
    /** 段标题文案（head 行才用） */
    label: string
    abnormal: boolean
}

/** 分段轨迹摊平成行（段序与段内序都沿用给进来的轴序） */
export function toTimelineRows(groups: TrackingGroup[]): TimelineRow[] {
    return groups.flatMap((group) =>
        group.nodes.map((node, index) => ({
            node,
            key: node.key,
            head: index === 0,
            label: group.label,
            abnormal: group.abnormal,
        })),
    )
}

/**
 * 姓名脱敏：张三 → 张**（首字保留，其余掩掉；单字姓名原样返回）。
 * 号码的掩码不在这份文件里——它的形状归 `@shop/common` 的 `maskPhone`（GEN-51 的前端半边），
 * 姓名这一档只有物流页用，是本页的展示决定。
 */
export function maskName(name: string): string {
    return name.length > 1 ? `${name.slice(0, 1)}${"*".repeat(name.length - 1)}` : name
}

type WebLogisticsStatusKey = Extract<WebMessageKey, `logistics.status.${string}`>
type WebLogisticsNodeKey = Extract<WebMessageKey, `logistics.node.${string}`>
