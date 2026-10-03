import type { ClaimableCouponResponse, MyCouponResponse } from "@shop/api/sdk"
import { formatDateTime } from "@shop/app-kit/display"
import {
    USER_COUPON_STATUSES,
    statusOptionsFromKeys,
    type KeyedStatusOption,
    type UserCouponStatus,
} from "@shop/common/domain"
import { ErrorCodes, toApiError } from "@shop/common/contract"
import { type AppLocale } from "@shop/common/i18n"
import type { WebMessageKey } from "#/locales/messages.gen"

/**
 * coupon 领域层 —— 优惠券的业务类型 + wire→领域投影 + 本域纯派生（不碰 React / 网络）。
 *
 * 只归一形状（可空 → undefined），不造假默认值：契约说 `orderId` 可空，就用 undefined 表达「没关联订单」，
 * 不补一个空串；反之必填字段也不兜底 —— 契约收紧后兜底只会掩盖漂移。
 *
 * 规则的一句话事实（门槛/面额/折扣率）来自 `@shop/common`，句子在 `coupon-rule` 用 t() 拼；
 * 状态徽章与页签那句中文（未使用/结算中/…）连同配色是本域的买家视角表（键进 catalog）——
 * §4.1：common 不承载用户可见文案，运营列表另有自己那套配色（VOID 对买家中性、对运营读成红）。
 * 一张券在券包、店铺领券、结算选券三处的**状态读法**必须一致，所以这份买家表在本域只此一处。
 */

// 业务类型
/**
 * 券包业务形状（`GET /coupons/mine` 的一条）：契约之上只改一处 ——
 * 可空的 `orderId` 归一成 undefined。`unavailableReason`（C8）按契约如实透传；
 * 按后端行为这里只会出现时间类两值（NOT_EFFECTIVE / EXPIRED，门槛/币种原因只在结算给出），
 * 但类型不为此收窄——契约说什么就是什么。其余字段同名同型，用 Omit 组合，不逐字段抄书。
 *
 * 契约读不出的几条语义：
 * - `threshold` / `discount`：Money（分 + 币种），门槛为 0 即「无门槛」（文案见 @shop/common 的 couponRuleText）；
 * - `effectiveAt` / `expireAt`：ISO 绝对时间（领取时已固化，不再随模板改动）；
 * - `shopName`：契约非空（店铺注销时的 null 口径见订单侧，券包这条契约上不给）；
 * - `status`：后端 `MyCoupon.displayStatus` 算出来的值（库里可能还是 UNUSED 而事实已过期），
 *   不是用户券的原始 status。取值 UNUSED / LOCKED / USED / EXPIRED / VOID；
 * - `source`：CLAIM / REFUND_RETURN（退款补发必须让用户看见，否则像凭空多出来的券）；
 * - `unavailableReason`：只对「还在手上」的券（UNUSED/LOCKED）给出的时间原因，其余为 null。
 */
export type MyCoupon = Omit<MyCouponResponse, "orderId"> & {
    /** 核销/占用的订单；未用掉的券没有订单（契约可空） */
    orderId?: string
}

/** 店铺可领券业务形状：契约（C9 起）已带必填的 `claimable`，形状与 wire 完全一致，不再造镜像类型 */
export type ClaimableCoupon = ClaimableCouponResponse

// wire → 领域
/** 券包 wire → 业务：唯一需要归一的是可空的 orderId（null → undefined）；unavailableReason 随展开透传 */
export function toMyCoupon(dto: MyCouponResponse): MyCoupon {
    return { ...dto, orderId: dto.orderId ?? undefined }
}

/** 可领券 wire → 业务：现零归一，函数存在的意义是守住「wire → 领域」这一道边界 */
export function toClaimableCoupon(dto: ClaimableCouponResponse): ClaimableCoupon {
    return { ...dto }
}

// 页签
/** 券包页签值 = 后端 `MyCouponQuery.status` 的筛选值 */
export type CouponTab = "UNUSED" | "USED" | "EXPIRED"

// 状态徽章（买家视角）
/**
 * 徽章皮肤：这四个字面量都必须在 ui-web `Badge` 的 variant 里真实存在。
 * web 不依赖 ui-web 的类型导出（这里就地声明），加一档前先去 badge.tsx 确认有那一档。
 */
type BuyerBadgeVariant = "success" | "warning" | "secondary" | "outline"

/** 状态名的 catalog key 子集：`web.coupon.status.<码>`，写错键即编译错 */
type CouponStatusKey = Extract<WebMessageKey, `web.coupon.status.${string}`>

/**
 * 券展示状态 → 「叫什么（键）+ 什么颜色」：文字与徽章一张表，不设平行表。
 *
 * `LOCKED` 是「已被未付款订单占用」，对用户说「结算中」比「已锁定」更像个状态而不是故障。
 * 这是**买家视角**那张表：券包卡片、页签、分组标题共用它，一个状态只有一句中文（一个键）。
 * 运营列表不共用——VOID/EXPIRED 对运营是不同颜色（动作事实 vs 中性翻篇），见 admin coupon-ops。
 * 卖家券模板另说「活动跑到哪一段」（未开始/进行中…），那是另一套主语，也不在这里。
 */
const COUPON_STATUS_META: Record<
    UserCouponStatus,
    { labelKey: CouponStatusKey; variant: BuyerBadgeVariant }
> = {
    UNUSED: { labelKey: "web.coupon.status.UNUSED", variant: "success" },
    LOCKED: { labelKey: "web.coupon.status.LOCKED", variant: "warning" },
    USED: { labelKey: "web.coupon.status.USED", variant: "secondary" },
    EXPIRED: { labelKey: "web.coupon.status.EXPIRED", variant: "outline" },
    VOID: { labelKey: "web.coupon.status.VOID", variant: "outline" },
}

/** string 索引视图：契约给的 status 是自由 string，查表得容得下表里没有的码 */
const STATUS_BY_KEY: Record<
    string,
    { labelKey: CouponStatusKey; variant: BuyerBadgeVariant } | undefined
> = COUPON_STATUS_META

/**
 * 卡片徽章查表：契约先出现新状态、这张表还没跟上时，回退成「无键 + 中性描边」——
 * 渲染层拿 `labelKey === undefined` 就退回调码本身，宁可显示生僻词也不出现一张没颜色的空白徽章。
 */
export function couponStatusMeta(status: string): {
    labelKey: CouponStatusKey | undefined
    variant: BuyerBadgeVariant
} {
    const meta = STATUS_BY_KEY[status]
    return { labelKey: meta?.labelKey, variant: meta?.variant ?? "outline" }
}

/**
 * 券包页签：状态表的一个子集（「未使用 / 已使用 / 已过期」三档），从 COUPON_STATUS_META 派生键。
 *
 * 页签和卡片徽章说的是同一个状态，只许有一份文案；这里只声明「哪几个状态成页签」，
 * 名字交给表——省掉逐条手写「加一页签要抄一遍键」的复制。
 *
 * 「未使用」页签在后端同时收 LOCKED（已被未付款订单占用）—— 对用户它就是「还没用掉的券」，
 * 所以一页里可能混两种展示状态，见 {@link groupByStatus}。
 */
export const COUPON_TABS: ReadonlyArray<KeyedStatusOption<CouponTab, CouponStatusKey>> =
    statusOptionsFromKeys<CouponTab, CouponStatusKey>(COUPON_STATUS_META, [
        "UNUSED",
        "USED",
        "EXPIRED",
    ])

/** 券包一页的默认条数：与分页控件共用一个常量，避免两处各写一个数导致总页数算错 */
export const COUPON_PAGE_SIZE = 10

// 按展示状态分组
export type CouponGroup = { status: string; coupons: MyCoupon[] }

/**
 * 分组顺序按 `USER_COUPON_STATUSES`（@shop/common）里登记的次序固定，不随接口返回顺序抖动
 * （同一份数据两次渲染分组位置不同是「列表在跳」的错觉来源）。
 * 顺序只在码表那一处登记：这里再抄一份数组，加状态时这份不会报错，只会把新状态挤到最后。
 */
const STATUS_ORDER: readonly string[] = USER_COUPON_STATUSES

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

// 券面的补充行
/**
 * 时间原因灰字（C8）：只对「还在手上却暂时/永远用不了」的行给出。
 * 未使用且已过期不会走到 EXPIRED 分支 —— 后端展示状态已把它折叠成 EXPIRED 徽章；
 * 到得了这里的过期是 LOCKED（被未付款订单占用、收敛任务不碰它），状态徽章不会解释这个。
 */
export function couponTimeReasonHint(coupon: MyCoupon, locale: AppLocale): string | undefined {
    if (coupon.status !== "UNUSED" && coupon.status !== "LOCKED") return undefined
    switch (coupon.unavailableReason) {
        case "NOT_EFFECTIVE":
            return `尚未开始，${formatDateTime(coupon.effectiveAt, locale)} 起可用`
        case "EXPIRED":
            return "使用时间已过，本单之外不能再使用"
        default:
            return undefined
    }
}

// 错误判定
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
