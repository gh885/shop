import type { ClaimableCouponResponse, MyCouponResponse } from "@shop/api/sdk"
import { ErrorCodes, couponStatusLabel, toApiError, type Money } from "@shop/common"

/**
 * coupon 领域层 —— 优惠券的业务类型 + wire→领域投影 + 本域纯派生（不碰 React / 网络）。
 *
 * 只归一形状（可空 → undefined），不造假默认值：契约说 `orderId` 可空，就用 undefined 表达「没关联订单」，
 * 不补一个空串；反之必填字段也不兜底 —— 契约收紧后兜底只会掩盖漂移。
 *
 * 规则文案与状态/来源标签一律取 `@shop/common` 的共享文案层，本文件不重复一份：
 * 同一张券在券包、店铺领券、结算选券三处说法不同，用户会以为是三张不同的券。
 */

// ---------- 业务类型 ----------

/** 券包业务形状（`GET /coupons/mine` 的一条） */
export type MyCoupon = {
    id: string
    shopId: string
    /** 店铺注销时后端诚实返回 null（与订单同一口径，UI 显示「店铺已关闭」） */
    shopName: string
    name: string
    /** 门槛（分）：amount <= 0 即无门槛 */
    threshold: Money
    /** 面额（分） */
    discount: Money
    /** 生效时间 ISO（领取时已固化成绝对时间） */
    effectiveAt: string
    /** 失效时间 ISO */
    expireAt: string
    /**
     * 展示状态：后端 `MyCoupon.displayStatus` 的算出来的值（库里可能还是 UNUSED 而事实已过期），
     * 不是用户券的原始 status。取值 UNUSED / LOCKED / USED / EXPIRED / VOID。
     */
    status: string
    /** 来源：CLAIM / REFUND_RETURN（退款补发必须让用户看见，否则像凭空多出来的券） */
    source: string
    /** 核销/占用的订单；未用掉的券没有订单（契约可空） */
    orderId?: string
}

/** 店铺可领券业务形状（`GET /api/shops/{shopId}/coupons` 的一条，匿名可读） */
export type ClaimableCoupon = {
    id: string
    name: string
    threshold: Money
    discount: Money
    validFrom: string
    validTo: string
    /** 先到先得闸门：已发完（issued >= total）。UI 必须给明确文案，不能只靠置灰 */
    soldOut: boolean
}

// ---------- wire → 领域 ----------

/** 券包 wire → 业务：唯一需要归一的是可空的 orderId（null → undefined） */
export function toMyCoupon(dto: MyCouponResponse): MyCoupon {
    return {
        id: dto.id,
        shopId: dto.shopId,
        shopName: dto.shopName,
        name: dto.name,
        threshold: dto.threshold,
        discount: dto.discount,
        effectiveAt: dto.effectiveAt,
        expireAt: dto.expireAt,
        status: dto.status,
        source: dto.source,
        orderId: dto.orderId ?? undefined,
    }
}

/** 可领券 wire → 业务：字段已一一对应，保持原样，不做任何补值 */
export function toClaimableCoupon(dto: ClaimableCouponResponse): ClaimableCoupon {
    return {
        id: dto.id,
        name: dto.name,
        threshold: dto.threshold,
        discount: dto.discount,
        validFrom: dto.validFrom,
        validTo: dto.validTo,
        soldOut: dto.soldOut,
    }
}

// ---------- 页签 ----------

/** 券包页签值 = 后端 `MyCouponQuery.status` 的筛选值 */
export type CouponTab = "UNUSED" | "USED" | "EXPIRED"

/**
 * 券包页签。标签取共享文案层的 `couponStatusLabel`，不另写一份中文：
 * 页签叫「已过期」而卡片标签叫「过期券」是同一件事的两种说法。
 *
 * 「未使用」页签在后端同时收 LOCKED（已被未付款订单占用）—— 对用户它就是「还没用掉的券」，
 * 所以一页里可能混两种展示状态，见 {@link groupByStatus}。
 */
export const COUPON_TABS: readonly { value: CouponTab; label: string }[] = [
    { value: "UNUSED", label: couponStatusLabel("UNUSED") },
    { value: "USED", label: couponStatusLabel("USED") },
    { value: "EXPIRED", label: couponStatusLabel("EXPIRED") },
]

/** 券包一页的默认条数：与分页控件共用一个常量，避免两处各写一个数导致总页数算错 */
export const COUPON_PAGE_SIZE = 10

// ---------- 按展示状态分组 ----------

export type CouponGroup = { status: string; coupons: MyCoupon[] }

/**
 * 状态机顺序：未使用 → 结算中 → 已使用 → 已过期 → 已作废。
 * 分组顺序按它固定，不随接口返回顺序抖动（同一份数据两次渲染分组位置不同是「列表在跳」的错觉来源）。
 */
const STATUS_ORDER = ["UNUSED", "LOCKED", "USED", "EXPIRED", "VOID"]

/** 未知状态排在最后（契约新增状态值时不会插到「未使用」前面），组内保持接口原顺序 */
function statusRank(status: string): number {
    const index = STATUS_ORDER.indexOf(status)
    return index === -1 ? STATUS_ORDER.length : index
}

/**
 * 按展示状态分组。用途是「未使用」页签里混进 LOCKED（结算中）时给分组标题 ——
 * 卡片上的小标签说不清「这一整段为什么和上面不一样」，一个分组标题可以。
 */
export function groupByStatus(coupons: MyCoupon[]): CouponGroup[] {
    const groups = new Map<string, MyCoupon[]>()
    for (const coupon of coupons) {
        const list = groups.get(coupon.status)
        if (list) list.push(coupon)
        else groups.set(coupon.status, [coupon])
    }
    return [...groups.entries()]
        .toSorted(([a], [b]) => statusRank(a) - statusRank(b))
        .map(([status, list]) => ({ status, coupons: list }))
}

// ---------- 错误判定 ----------

/**
 * 领券撞「已领过」。
 *
 * 后端有两条路径会走到这里（友好判重 + 唯一索引并发兜底），文档 §15.2 规定两条都带同一个 code。
 * 所以必须认 code 而不是只认 409：409 也可能是「已领完」，把已领完说成「已领取」是另一种误导。
 */
export function isCouponAlreadyClaimed(err: unknown): boolean {
    const e = toApiError(err)
    return e.code === ErrorCodes.COUPON_ALREADY_CLAIMED
}
