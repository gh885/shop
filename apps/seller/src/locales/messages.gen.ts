// 生成物，别手改：pnpm gen:i18n（判据与清单见 scripts/i18n-codegen.mjs、docs/conventions/i18n.md §5.5）
// 来源：apps/seller/src/locales/{zh-CN, en-US}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致。这条保证属于生成期，手改这份文件不会让它成立。

import type { AppKitMessageKey, AppKitParamsOf } from "@shop/app-kit/i18n"

/** namespace `account`：3 条。收窄入口 `SellerScopedT<"account">` */
export type AccountKeys =
    "seller.account.notLoggedIn" |
    "seller.account.description" |
    "seller.account.logout"

/** namespace `app`：1 条。收窄入口 `SellerScopedT<"app">` */
export type AppKeys =
    "app.title"

/** namespace `common`：10 条。收窄入口 `SellerScopedT<"common">` */
export type CommonKeys =
    "common.notFound.title" |
    "common.notFound.description" |
    "common.action.backHome" |
    "common.unpriced" |
    "common.loadFailed.carriers" |
    "common.loadFailed.specTemplate" |
    "common.loadFailed.sku" |
    "common.loadFailed.categoryTree" |
    "common.loadFailed.invites" |
    "common.upload.ticketFailed"

/** namespace `coupon`：49 条。收窄入口 `SellerScopedT<"coupon">` */
export type CouponKeys =
    "seller.coupon.rule.reduction.threshold" |
    "seller.coupon.rule.reduction.noThreshold" |
    "seller.coupon.rule.rate.threshold" |
    "seller.coupon.rule.rate.thresholdCapped" |
    "seller.coupon.rule.rate.noThreshold" |
    "seller.coupon.rule.rate.noThresholdCapped" |
    "seller.coupon.form.title" |
    "seller.coupon.form.intro" |
    "seller.coupon.form.name.label" |
    "seller.coupon.form.name.placeholder" |
    "seller.coupon.form.type.label" |
    "seller.coupon.type.FULL_REDUCTION" |
    "seller.coupon.type.DISCOUNT" |
    "seller.coupon.form.threshold.label" |
    "seller.coupon.form.threshold.placeholder" |
    "seller.coupon.form.rate.label" |
    "seller.coupon.form.rate.placeholder" |
    "seller.coupon.form.discount.label" |
    "seller.coupon.form.discount.placeholder" |
    "seller.coupon.form.maxDiscount.label" |
    "seller.coupon.form.maxDiscount.placeholder" |
    "seller.coupon.form.maxDiscount.hint" |
    "seller.coupon.form.total.label" |
    "seller.coupon.form.total.placeholder" |
    "seller.coupon.form.windowFrom.label" |
    "seller.coupon.form.windowFrom.hint" |
    "seller.coupon.form.windowTo.label" |
    "seller.coupon.form.windowTo.hint" |
    "seller.coupon.form.validDays.label" |
    "seller.coupon.form.validDays.placeholder" |
    "seller.coupon.form.validDays.hint" |
    "seller.coupon.form.submit" |
    "seller.coupon.form.err.nameRequired" |
    "seller.coupon.form.err.nameMax" |
    "seller.coupon.form.err.thresholdRequired" |
    "seller.coupon.form.err.thresholdFormat" |
    "seller.coupon.form.err.totalRequired" |
    "seller.coupon.form.err.totalInt" |
    "seller.coupon.form.err.totalMax" |
    "seller.coupon.form.err.windowFromRequired" |
    "seller.coupon.form.err.windowToRequired" |
    "seller.coupon.form.err.rateRange" |
    "seller.coupon.form.err.maxDiscountRequired" |
    "seller.coupon.form.err.maxDiscountFormat" |
    "seller.coupon.form.err.discountRequired" |
    "seller.coupon.form.err.discountPositive" |
    "seller.coupon.form.err.discountOverThreshold" |
    "seller.coupon.form.err.validDaysRange" |
    "seller.coupon.form.err.windowOrder"

/** namespace `layout`：2 条。收窄入口 `SellerScopedT<"layout">` */
export type LayoutKeys =
    "seller.layout.workbench" |
    "seller.layout.brand"

/** namespace `login`：5 条。收窄入口 `SellerScopedT<"login">` */
export type LoginKeys =
    "seller.login.title" |
    "seller.login.welcome" |
    "seller.login.headline" |
    "seller.login.pitch" |
    "seller.login.youAreHere"

/** namespace `nav`：42 条。收窄入口 `SellerScopedT<"nav">` */
export type NavKeys =
    "seller.nav.home" |
    "seller.nav.trade" |
    "seller.nav.trade.section.0" |
    "seller.nav.trade.section.1" |
    "seller.nav.trade.order" |
    "seller.nav.trade.shipping" |
    "seller.nav.trade.ship" |
    "seller.nav.trade.logistics" |
    "seller.nav.trade.refund" |
    "seller.nav.trade.review" |
    "seller.nav.trade.buyershow" |
    "seller.nav.product" |
    "seller.nav.product.section.0" |
    "seller.nav.product.section.1" |
    "seller.nav.product.list" |
    "seller.nav.product.create" |
    "seller.nav.product.category" |
    "seller.nav.product.stock" |
    "seller.nav.product.supplier" |
    "seller.nav.product.purchase" |
    "seller.nav.product.price" |
    "seller.nav.shop" |
    "seller.nav.shop.section.0" |
    "seller.nav.shop.section.1" |
    "seller.nav.shop.list" |
    "seller.nav.shop.address" |
    "seller.nav.shop.member" |
    "seller.nav.shop.decoration" |
    "seller.nav.shop.notice" |
    "seller.nav.shop.license" |
    "seller.nav.shop.brand" |
    "seller.nav.marketing" |
    "seller.nav.marketing.section.0" |
    "seller.nav.marketing.campaign" |
    "seller.nav.marketing.coupon" |
    "seller.nav.marketing.flash" |
    "seller.nav.service" |
    "seller.nav.data" |
    "seller.nav.data.section.0" |
    "seller.nav.data.overview" |
    "seller.nav.data.report" |
    "seller.nav.data.visit"

/** namespace `order`：26 条。收窄入口 `SellerScopedT<"order">` */
export type OrderKeys =
    "seller.order.tab.all" |
    "seller.order.status.PENDING_PAYMENT" |
    "seller.order.status.PAID" |
    "seller.order.status.SHIPPED" |
    "seller.order.status.COMPLETED" |
    "seller.order.status.CANCELLED" |
    "seller.order.afterSale.APPLYING" |
    "seller.order.afterSale.RETURNING" |
    "seller.order.afterSale.REFUNDED" |
    "seller.order.afterSale.REJECTED" |
    "seller.order.afterSale.CLOSED" |
    "seller.order.ticketType.REFUND_ONLY" |
    "seller.order.ticketType.RETURN_REFUND" |
    "seller.order.ticketStatus.APPLYING" |
    "seller.order.ticketStatus.RETURNING" |
    "seller.order.ticketStatus.REFUNDED" |
    "seller.order.ticketStatus.REJECTED" |
    "seller.order.ticketStatus.CLOSED" |
    "seller.order.reason.NO_REASON" |
    "seller.order.reason.QUALITY_ISSUE" |
    "seller.order.reason.NOT_AS_DESCRIBED" |
    "seller.order.reason.DAMAGED" |
    "seller.order.reason.WRONG_ITEM" |
    "seller.order.reason.MISSING_ITEM" |
    "seller.order.reason.OTHER" |
    "seller.order.reason.none"

/** namespace `product`：8 条。收窄入口 `SellerScopedT<"product">` */
export type ProductKeys =
    "product.publish.forbiddenWordHit" |
    "seller.product.status.PUBLISHED" |
    "seller.product.status.WAREHOUSE" |
    "seller.product.status.DRAFT" |
    "seller.product.err.priceFormat" |
    "seller.product.err.countFormat" |
    "seller.product.err.priceFirst" |
    "seller.product.err.imagesRequired"

/** namespace `shipping`：42 条。收窄入口 `SellerScopedT<"shipping">` */
export type ShippingKeys =
    "seller.shipping.region.title" |
    "seller.shipping.region.hint" |
    "seller.shipping.region.add" |
    "seller.shipping.region.emptyHint" |
    "seller.shipping.region.itemTitle" |
    "seller.shipping.region.removeAria" |
    "seller.shipping.region.coverage" |
    "seller.shipping.freeShipping.title" |
    "seller.shipping.freeShipping.hint" |
    "seller.shipping.freeShipping.field" |
    "seller.shipping.freeShipping.fieldHint" |
    "seller.shipping.freeShipping.onHint" |
    "seller.shipping.freeShipping.quantityLabel" |
    "seller.shipping.freeShipping.amountLabel" |
    "seller.shipping.freeShipping.thresholdPlaceholder" |
    "seller.shipping.default.title" |
    "seller.shipping.default.hint" |
    "seller.shipping.blocked.title" |
    "seller.shipping.blocked.hint" |
    "seller.shipping.blocked.field" |
    "seller.shipping.blocked.placeholder" |
    "seller.shipping.tier.firstQuantity" |
    "seller.shipping.tier.firstFee" |
    "seller.shipping.tier.addQuantity" |
    "seller.shipping.tier.addFee" |
    "seller.shipping.regionPicker.placeholder" |
    "seller.shipping.regionPicker.searchPlaceholder" |
    "seller.shipping.regionPicker.selectedCount" |
    "seller.shipping.empty.title" |
    "seller.shipping.editNotice" |
    "seller.shipping.saveNotice" |
    "seller.shipping.save.new" |
    "seller.shipping.save.edit" |
    "seller.shipping.err.firstQuantityInt" |
    "seller.shipping.err.firstFeeFormat" |
    "seller.shipping.err.addQuantityInt" |
    "seller.shipping.err.addFeeFormat" |
    "seller.shipping.err.freeOverQuantityInt" |
    "seller.shipping.err.freeOverAmountFormat" |
    "seller.shipping.err.regionMissing" |
    "seller.shipping.err.duplicateRegion" |
    "seller.shipping.err.excludedConflict"

/** namespace `shop`：29 条。收窄入口 `SellerScopedT<"shop">` */
export type ShopKeys =
    "seller.shop.list.title" |
    "seller.shop.list.subtitle" |
    "seller.shop.list.empty.title" |
    "seller.shop.list.empty.body" |
    "seller.shop.card.current" |
    "seller.shop.card.createdAt" |
    "seller.shop.card.setCurrent" |
    "seller.shop.resubmit.success" |
    "seller.shop.resubmit.error" |
    "seller.shop.resubmit.rejectReason" |
    "seller.shop.resubmit.rejectReasonFallback" |
    "seller.shop.resubmit.nameLabel" |
    "seller.shop.resubmit.submit" |
    "seller.shop.invite.join.success" |
    "seller.shop.invite.join.error" |
    "seller.shop.invite.reject.success" |
    "seller.shop.invite.reject.error" |
    "seller.shop.invite.sectionTitle" |
    "seller.shop.invite.body" |
    "seller.shop.invite.reject" |
    "seller.shop.invite.accept" |
    "seller.shop.create.error" |
    "seller.shop.create.title" |
    "seller.shop.create.subtitle" |
    "seller.shop.create.nameLabel" |
    "seller.shop.create.submit" |
    "seller.shop.create.pending" |
    "seller.shop.create.placeholder" |
    "seller.shop.err.regionRequired"

/** namespace `topbar`：4 条。收窄入口 `SellerScopedT<"topbar">` */
export type TopbarKeys =
    "seller.topbar.messages" |
    "seller.topbar.rules" |
    "seller.topbar.help" |
    "seller.topbar.support"

/**
 * namespace 名 → 该 namespace 的 key 类型。「有哪些 namespace 可选」的唯一真相，
 *  也是收窄形态 `SellerScopedT` 的入口。
 */
export type SellerNamespace = {
    "account": AccountKeys
    "app": AppKeys
    "common": CommonKeys
    "coupon": CouponKeys
    "layout": LayoutKeys
    "login": LoginKeys
    "nav": NavKeys
    "order": OrderKeys
    "product": ProductKeys
    "shipping": ShippingKeys
    "shop": ShopKeys
    "topbar": TopbarKeys
}

/** 本 root 全部 key 的联合（各 `{Ns}Keys` 的并集）。铺到几千条后打字面量会很难受，
 *  所以按 namespace 收窄的入口是 `SellerScopedT`——见 §4.2 末段。 */
export type SellerMessageKey = SellerNamespace[keyof SellerNamespace]

export type SellerParamsByKey = {
    "product.publish.forbiddenWordHit": { word: string | number }
    "seller.coupon.form.err.nameMax": { max: string | number }
    "seller.coupon.form.err.totalMax": { max: string | number }
    "seller.coupon.form.err.validDaysRange": { min: string | number; max: string | number }
    "seller.coupon.rule.rate.noThreshold": { rate: string | number }
    "seller.coupon.rule.rate.noThresholdCapped": { rate: string | number; cap: string | number }
    "seller.coupon.rule.rate.threshold": { threshold: string | number; rate: string | number }
    "seller.coupon.rule.rate.thresholdCapped": { threshold: string | number; rate: string | number; cap: string | number }
    "seller.coupon.rule.reduction.noThreshold": { discount: string | number }
    "seller.coupon.rule.reduction.threshold": { threshold: string | number; discount: string | number }
    "seller.shipping.err.duplicateRegion": { prefix: string | number }
    "seller.shipping.err.excludedConflict": { prefix: string | number }
    "seller.shipping.err.regionMissing": { index: string | number }
    "seller.shipping.region.itemTitle": { index: string | number }
    "seller.shipping.regionPicker.selectedCount": { count: string | number }
    "seller.shop.card.createdAt": { date: string | number }
    "seller.shop.invite.body": { shopName: string | number }
    "seller.shop.resubmit.rejectReason": { reason: string | number }
}

export type SellerParamsOf<K extends SellerMessageKey> = K extends keyof SellerParamsByKey
    ? SellerParamsByKey[K]
    : undefined

/**
 * 本端调用侧的 `t` 形状：key 收在「本端 catalog ∪ app-kit 共享 catalog」，参数按各自的
 * `ParamsOf` 推。无参消息的参数位是 `undefined`，多塞一个就是编译错误。
 * 带参消息使用必需参数元组，漏传参数在编译时失败。
 * ICU 类型由 codegen 生成；运行时交给 i18next-icu。
 * 这是 §5.5 分工表里唯一那条「编译期」保证在三端兑现的地方。
 */
export type SellerTranslate = <K extends SellerMessageKey | AppKitMessageKey>(
    key: K,
    ...args: (K extends SellerMessageKey ? SellerParamsOf<K> : AppKitParamsOf<Extract<K, AppKitMessageKey>>) extends undefined
        ? [] : [params: K extends SellerMessageKey ? SellerParamsOf<K> : AppKitParamsOf<Extract<K, AppKitMessageKey>>]
) => string

/**
 * 按 namespace 收窄的 `t`：`useT("nav")` 拿它。key 位只收那一个 namespace 的 key，
 * 所以打错 key 的报错只列本 namespace 的候选，而不是整份联合。
 * 要 app-kit 的共享文案（`appKit.*` / `error.*`）就用不传 namespace 的整份 `t`。
 */
export type SellerScopedT<N extends keyof SellerNamespace> = <K extends SellerNamespace[N]>(
    key: K,
    ...args: SellerParamsOf<K> extends undefined ? [] : [params: SellerParamsOf<K>]
) => string

/** 一种语言里 SellerMessageKey 的每一个都得有一句 */
export type SellerCatalog = { [K in SellerMessageKey]: string }
