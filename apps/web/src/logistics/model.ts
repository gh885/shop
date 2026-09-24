import { format, isValid } from "date-fns"

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
export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
    PENDING_PICKUP: "等待揽收",
    PICKED_UP: "已揽件",
    IN_TRANSIT: "运输中",
    DELIVERING: "派送中",
    DELIVERED: "已签收",
    RETURNED: "已退回",
    EXCEPTION: "物流异常",
}

/** 节点描述为空时的兜底文案：承运商偶尔只给状态码不给描述，宁可给一句干巴巴的话也不留空行 */
export const TRACKING_NODE_LABEL: Record<TrackingNodeCode, string> = {
    PICKED_UP: "快件已揽收",
    ARRIVED_HUB: "快件已到达",
    DEPARTED_HUB: "快件已发出",
    OUT_FOR_DELIVERY: "快件派送中",
    DELIVERED: "快件已签收",
    RETURNED: "快件已退回",
    EXCEPTION: "快件异常",
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
 * ISO 时间 → 节点时间文案「MM-dd HH:mm」。
 * 与 app-kit 的 formatTimeShort 不同：**跨年补年份**——只给月日时，去年 12 月与今年 12 月在
 * 同一条轴上无法区分。非法时间原样返回（与展示兜底约定一致）。
 */
export function formatNodeTime(iso: string, now: Date = new Date()): string {
    const d = new Date(iso)
    if (!isValid(d)) return iso
    return format(d, d.getFullYear() === now.getFullYear() ? "MM-dd HH:mm" : "yyyy-MM-dd HH:mm")
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
 * 姓名脱敏：张三 → 张**（首字保留，其余掩掉；单字姓名原样返回）。
 * 号码的掩码不在这份文件里——它的形状归 `@shop/common` 的 `maskPhone`（GEN-51 的前端半边），
 * 姓名这一档只有物流页用，是本页的展示决定。
 */
export function maskName(name: string): string {
    return name.length > 1 ? `${name.slice(0, 1)}${"*".repeat(name.length - 1)}` : name
}
