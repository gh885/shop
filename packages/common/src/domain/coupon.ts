// 优惠券的码值词表（跨端共享）。只给「有哪些状态码」这份事实；把契约数字与码值翻译成人话的换算
// 已随券模块退场一起删除（生产代码零消费，公开面门禁判死），券模块落回来时按当时的契约重建。

/**
 * 已知券状态，顺序即展示顺序（未用 → 锁定 → 已用 → 过期 → 作废）。
 *
 * <p>手写常量：契约里今天没有 `AdminCouponItem`（券模块在重写期退场，领取/核销/卖家券管理未落地）。
 * 买家侧的 `status` 在 wire 上是自由 string，未知值由展示层兜底成 outline 徽章。
 */
export const USER_COUPON_STATUSES = ["UNUSED", "LOCKED", "USED", "EXPIRED", "VOID"] as const

export type UserCouponStatus = (typeof USER_COUPON_STATUSES)[number]

// 状态徽章（文字+颜色）一律在各端 catalog（§4.1）：这套配色是买家视角读法，运营列表另有自己的（VOID 对买家中性描边、对运营是已做出的动作要读成红）。这里只留「有哪几个状态码」这份事实，谁念、念成什么颜色由持有该视角的端决定。
