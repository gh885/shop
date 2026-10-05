import { sumMoney, type Money } from "@shop/common/domain"
import type { Address, Group, Item, UnavailableLine as SdkUnavailableLine } from "@shop/api/sdk"

/** 行明细：契约同 SDK Item，仅主图归一（SDK 可空 null，UI 用占位图 → undefined） */
type CheckoutLine = Omit<Item, "image"> & { image?: string }

/** 按店分组：契约同 SDK Group（含 discountAmount / coupons / appliedCouponId 券三件套），行明细换成本地归一后的 CheckoutLine */
export type CheckoutGroup = Omit<Group, "lines"> & { lines: CheckoutLine[] }

/** 失效行：契约同 SDK UnavailableLine，仅主图归一 */
export type UnavailableLine = Omit<SdkUnavailableLine, "image"> & { image?: string }

/**
 * 每店选中的券：`shopId → userCouponId`；`null` = 明确选「不使用优惠券」。
 *
 * 一次结算按店拆单，每店至多一张券，所以形状是 Record 而不是数组。
 * 「这家店用户还没表态」与「用户选了不使用」是两件事，前者用**键不存在**表达（不是 null）——
 * 这正是默认选券能"只补缺、不覆盖"的前提。
 */
export type CouponSelection = Record<string, string | null>

/** 结算预览业务形状：按店分组明细 + 失效行置灰 + 地址回显可选 + 应付总额 */
export type CheckoutPreview = {
    /** 按店拆单预告（每店一组，含行明细/商品额/运费/券减免/应付） */
    groups: CheckoutGroup[]
    /** 失效行（售罄/下架），前端置灰不可选 */
    unavailable: UnavailableLine[]
    /** 回显的地址（后端缺省返回 null，前端自选） */
    address?: Address
    /** 全部应付总额（后端已算净额 = Σ payAmount） */
    totalPayAmount: Money
}

/**
 * 默认选中的券：候选里的**第一张可用券**。
 *
 * 候选顺序由后端定（可用优先 → 减得多优先 → 先过期优先 → id），所以这里只取 head，
 * 不写比较器——前端再排一次，迟早和"后端以为你选了什么"对不上。
 * 后端不会自动选券（`appliedCouponId` 只是回显请求里的 id），默认选中是前端的事。
 */
export function defaultCouponId(group: CheckoutGroup): string | null {
    // oxlint-disable-next-line no-null -- CouponSelection 契约：null = 明确选「不使用优惠券」（见类型注释）
    return group.coupons.find((c) => c.usable)?.userCouponId ?? null
}

/**
 * 把「用户的选择」补齐成「本次结算每店实际用哪张券」，并剔除已不在本次结算里的店。
 *
 * 三条规则：
 * - 键不存在的店 = 用户还没表态 → 补默认（第一张可用券，可能为 null「没有可用的」）；
 * - 键存在 = 用户已表态（含明确选「不使用」的 null）→ 原样保留，**绝不被后来的预览覆盖**；
 * - 已不在本次结算里的店 → 丢掉：把不属于这一单的券发给后端，只会换来一个 400。
 *
 * 没有任何变化时返回入参本身：调用方是 effect → setState，靠引用相等才能避免
 * 「setState → 重新预览 → 再 setState」的取数循环。
 */
export function withDefaultCoupons(
    groups: CheckoutGroup[],
    choice: CouponSelection,
): CouponSelection {
    let changed = false
    const next: CouponSelection = { ...choice }
    for (const shopId of Object.keys(next)) {
        if (groups.some((g) => g.shopId === shopId)) continue
        delete next[shopId]
        changed = true
    }
    for (const g of groups) {
        if (g.shopId in next) continue
        next[g.shopId] = defaultCouponId(g)
        changed = true
    }
    return changed ? next : choice
}

/**
 * 每店选中券 → 请求体 `userCouponIds`：过滤未选 / 明确不用的店。
 *
 * 排序不是业务需要（券 id 与顺序无关），而是让同一份选择的 queryKey 稳定：
 * Record 的键序取决于用户点选顺序，不排序就会因为"先选了二店"而白白重新预览一次。
 */
export function couponIdsOf(selection: CouponSelection): string[] {
    return Object.values(selection)
        .filter((id): id is string => typeof id === "string" && id !== "")
        .toSorted()
}

/** 右栏结算卡的三笔小计（商品总价 / 运费 / 优惠），由分组逐行相加得到 */
export type CheckoutTotals = {
    itemAmount: Money
    shippingFee: Money
    discountAmount: Money
}

/**
 * 按店分组 → 结算卡的三笔小计。
 *
 * 与顶层 `totalPayAmount` 分工：那个是后端算好的**净额**（已减券），拿来当「商品总价」会把
 * 优惠算两遍（AGENTS 的 Money 条款：金额口径只有一处定义）。所以这三笔在前端按分组求和，
 * 口径与订单详情页的 `OrderCard` 同行小计求和一致。
 */
export function checkoutTotals(preview: CheckoutPreview | undefined): CheckoutTotals {
    const groups = preview?.groups ?? []
    return {
        itemAmount: sumMoney(groups.map((g) => g.itemAmount)),
        shippingFee: sumMoney(groups.map((g) => g.shippingFee)),
        discountAmount: sumMoney(groups.map((g) => g.discountAmount)),
    }
}
