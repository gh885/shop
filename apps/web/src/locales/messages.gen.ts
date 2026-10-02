// 生成物，别手改：pnpm gen:i18n（判据与清单见 scripts/i18n-codegen.mjs、docs/conventions/i18n.md §5.5）
// 来源：apps/web/src/locales/{zh-CN, en-US}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致。这条保证属于生成期，手改这份文件不会让它成立。

import type { AppKitMessageKey, AppKitParamsOf } from "@shop/app-kit/i18n"

/** namespace `app`：2 条。收窄入口 `WebScopedT<"app">` */
export type AppKeys =
    "app.title" |
    "app.description"

/** namespace `common`：9 条。收窄入口 `WebScopedT<"common">` */
export type CommonKeys =
    "common.notFound.title" |
    "common.notFound.description" |
    "common.action.backHome" |
    "common.loadFailed.feed" |
    "common.loadFailed.banners" |
    "common.loadFailed.categoryNav" |
    "common.loadFailed.shopBar" |
    "common.loadFailed.recommend" |
    "common.loadFailed.profile"

/** namespace `coupon`：7 条。收窄入口 `WebScopedT<"coupon">` */
export type CouponKeys =
    "web.coupon.rule.reduction.threshold" |
    "web.coupon.rule.reduction.noThreshold" |
    "web.coupon.rule.rate.threshold" |
    "web.coupon.rule.rate.thresholdCapped" |
    "web.coupon.rule.rate.noThreshold" |
    "web.coupon.rule.rate.noThresholdCapped" |
    "web.coupon.face.rate"

/** namespace `favorite`：1 条。收窄入口 `WebScopedT<"favorite">` */
export type FavoriteKeys =
    "web.favorite.collected"

/** namespace `footer`：7 条。收窄入口 `WebScopedT<"footer">` */
export type FooterKeys =
    "web.footer.brand" |
    "web.footer.tagline" |
    "web.footer.group.shopping" |
    "web.footer.group.selling" |
    "web.footer.home" |
    "web.footer.openShop" |
    "web.footer.sellerCenter"

/** namespace `header`：5 条。收窄入口 `WebScopedT<"header">` */
export type HeaderKeys =
    "web.header.region" |
    "web.header.cart" |
    "web.header.login" |
    "web.header.account" |
    "web.header.logout"

/** namespace `login`：10 条。收窄入口 `WebScopedT<"login">` */
export type LoginKeys =
    "web.login.title" |
    "web.login.close" |
    "web.login.qrTitle" |
    "web.login.qrComing" |
    "web.login.qrHint" |
    "web.login.autoRegister" |
    "web.login.agreementPrefix" |
    "web.login.userAgreement" |
    "web.login.and" |
    "web.login.privacy"

/** namespace `nav`：30 条。收窄入口 `WebScopedT<"nav">` */
export type NavKeys =
    "web.nav.home" |
    "web.nav.category" |
    "web.nav.apparel" |
    "web.nav.women" |
    "web.nav.men" |
    "web.nav.shoes" |
    "web.nav.bags" |
    "web.nav.digital" |
    "web.nav.phones" |
    "web.nav.computers" |
    "web.nav.appliances" |
    "web.nav.beauty" |
    "web.nav.skincare" |
    "web.nav.makeup" |
    "web.nav.personalCare" |
    "web.nav.homeCategory" |
    "web.nav.furniture" |
    "web.nav.textiles" |
    "web.nav.kitchen" |
    "web.nav.food" |
    "web.nav.snacks" |
    "web.nav.fresh" |
    "web.nav.drinks" |
    "web.nav.baby" |
    "web.nav.formula" |
    "web.nav.diapers" |
    "web.nav.toys" |
    "web.nav.sell" |
    "web.nav.openShop" |
    "web.nav.sellerCenter"

/** namespace `order`：48 条。收窄入口 `WebScopedT<"order">` */
export type OrderKeys =
    "web.order.status.pending_payment" |
    "web.order.status.pending_shipment" |
    "web.order.status.pending_receipt" |
    "web.order.status.completed" |
    "web.order.status.cancelled" |
    "web.order.cardHint.pending_payment" |
    "web.order.cardHint.pending_shipment" |
    "web.order.cardHint.pending_receipt" |
    "web.order.cardHint.completed" |
    "web.order.cardHint.cancelled" |
    "web.order.tab.all" |
    "web.order.tabEmpty" |
    "web.order.progress.ordered" |
    "web.order.progress.paid" |
    "web.order.progress.shipped" |
    "web.order.progress.received" |
    "web.order.action.pay" |
    "web.order.action.cancel" |
    "web.order.action.logistics" |
    "web.order.action.confirm" |
    "web.order.action.extend_receive" |
    "web.order.action.rebuy" |
    "web.order.action.add_cart" |
    "web.order.action.ship" |
    "web.order.itemAction.add_cart" |
    "web.order.itemAction.after_sale" |
    "web.order.field.status" |
    "web.order.afterSale.type.REFUND_ONLY" |
    "web.order.afterSale.type.RETURN_REFUND" |
    "web.order.afterSale.typeHint.REFUND_ONLY" |
    "web.order.afterSale.typeHint.RETURN_REFUND" |
    "web.order.afterSale.reason.NO_REASON" |
    "web.order.afterSale.reason.QUALITY_ISSUE" |
    "web.order.afterSale.reason.NOT_AS_DESCRIBED" |
    "web.order.afterSale.reason.DAMAGED" |
    "web.order.afterSale.reason.WRONG_ITEM" |
    "web.order.afterSale.reason.MISSING_ITEM" |
    "web.order.afterSale.reason.OTHER" |
    "web.order.afterSale.ticketStatus.APPLYING" |
    "web.order.afterSale.ticketStatus.RETURNING" |
    "web.order.afterSale.ticketStatus.REFUNDED" |
    "web.order.afterSale.ticketStatus.REJECTED" |
    "web.order.afterSale.ticketStatus.CLOSED" |
    "web.order.afterSale.action.cancel" |
    "web.order.afterSale.action.return" |
    "web.order.afterSale.action.track" |
    "web.order.afterSale.action.reapply" |
    "web.order.afterSale.reasonUnset"

/** namespace `product`：1 条。收窄入口 `WebScopedT<"product">` */
export type ProductKeys =
    "web.product.sold"

/** namespace `route`：15 条。收窄入口 `WebScopedT<"route">` */
export type RouteKeys =
    "route.title.sell" |
    "route.title.search" |
    "route.title.account" |
    "route.title.address" |
    "route.title.coupons" |
    "route.title.favorites" |
    "route.title.orders" |
    "route.title.profile" |
    "route.title.security" |
    "route.title.cart" |
    "route.title.checkout" |
    "route.title.logistics" |
    "route.title.orderDetail" |
    "route.title.cashier" |
    "route.title.productFallback"

/** namespace `security`：27 条。收窄入口 `WebScopedT<"security">` */
export type SecurityKeys =
    "web.security.title" |
    "web.security.changePassword.title" |
    "web.security.changePassword.description" |
    "web.security.changePassword.success" |
    "web.security.changePassword.current" |
    "web.security.changePassword.currentPlaceholder" |
    "web.security.changePassword.currentRequired" |
    "web.security.changePassword.next" |
    "web.security.changePassword.nextPlaceholder" |
    "web.security.changePassword.nextTooShort" |
    "web.security.changePassword.confirm" |
    "web.security.changePassword.confirmPlaceholder" |
    "web.security.changePassword.mismatch" |
    "web.security.changePassword.submit" |
    "web.security.devices.title" |
    "web.security.devices.description" |
    "web.security.devices.logoutOne" |
    "web.security.devices.logoutAll" |
    "web.security.devices.logoutFailed" |
    "web.security.devices.logoutAllAction" |
    "web.security.devices.logoutAllTitle" |
    "web.security.devices.logoutAllConfirm" |
    "web.security.devices.current" |
    "web.security.devices.unknownIp" |
    "web.security.devices.logout" |
    "web.security.devices.empty.title" |
    "web.security.devices.empty.description"

/**
 * namespace 名 → 该 namespace 的 key 类型。「有哪些 namespace 可选」的唯一真相，
 *  也是收窄形态 `WebScopedT` 的入口。
 */
export type WebNamespace = {
    "app": AppKeys
    "common": CommonKeys
    "coupon": CouponKeys
    "favorite": FavoriteKeys
    "footer": FooterKeys
    "header": HeaderKeys
    "login": LoginKeys
    "nav": NavKeys
    "order": OrderKeys
    "product": ProductKeys
    "route": RouteKeys
    "security": SecurityKeys
}

/** 本 root 全部 key 的联合（各 `{Ns}Keys` 的并集）。铺到几千条后打字面量会很难受，
 *  所以按 namespace 收窄的入口是 `WebScopedT`——见 §4.2 末段。 */
export type WebMessageKey = WebNamespace[keyof WebNamespace]

type WebParamsByKey = {
    "web.coupon.face.rate": { rate: string | number }
    "web.coupon.rule.rate.noThreshold": { rate: string | number }
    "web.coupon.rule.rate.noThresholdCapped": { rate: string | number; cap: string | number }
    "web.coupon.rule.rate.threshold": { threshold: string | number; rate: string | number }
    "web.coupon.rule.rate.thresholdCapped": { threshold: string | number; rate: string | number; cap: string | number }
    "web.coupon.rule.reduction.noThreshold": { discount: string | number }
    "web.coupon.rule.reduction.threshold": { threshold: string | number; discount: string | number }
    "web.favorite.collected": { count: string | number }
    "web.order.tabEmpty": { status: string | number }
    "web.product.sold": { count: string | number }
}

export type WebParamsOf<K extends WebMessageKey> = K extends keyof WebParamsByKey
    ? WebParamsByKey[K]
    : undefined

/**
 * 本端调用侧的 `t` 形状：key 收在「本端 catalog ∪ app-kit 共享 catalog」，参数按各自的
 * `ParamsOf` 推。无参消息的参数位是 `undefined`，多塞一个就是编译错误。
 * 带参消息**漏传**参数不拦（那是可选位）——后果是模板原样显示（`formatMessage` 的降级），
 * 要连漏传一起拦得按 key 分发参数元组，等第一条真被漏过的消息出现再造。
 * 这是 §5.5 分工表里唯一那条「编译期」保证在三端兑现的地方。
 */
export type WebTranslate = <K extends WebMessageKey | AppKitMessageKey>(
    key: K,
    params?: K extends WebMessageKey
        ? WebParamsOf<K>
        : AppKitParamsOf<Extract<K, AppKitMessageKey>>,
) => string

/**
 * 按 namespace 收窄的 `t`：`useT("nav")` 拿它。key 位只收那一个 namespace 的 key，
 * 所以打错 key 的报错只列本 namespace 的候选，而不是整份联合。
 * 要 app-kit 的共享文案（`appKit.*` / `error.*`）就用不传 namespace 的整份 `t`。
 */
export type WebScopedT<N extends keyof WebNamespace> = <K extends WebNamespace[N]>(
    key: K,
    params?: WebParamsOf<K>,
) => string

/** 一种语言里 WebMessageKey 的每一个都得有一句 */
export type WebCatalog = { [K in WebMessageKey]: string }
