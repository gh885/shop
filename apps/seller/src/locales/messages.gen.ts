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

/** namespace `coupon`：6 条。收窄入口 `SellerScopedT<"coupon">` */
export type CouponKeys =
    "seller.coupon.rule.reduction.threshold" |
    "seller.coupon.rule.reduction.noThreshold" |
    "seller.coupon.rule.rate.threshold" |
    "seller.coupon.rule.rate.thresholdCapped" |
    "seller.coupon.rule.rate.noThreshold" |
    "seller.coupon.rule.rate.noThresholdCapped"

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

/** namespace `product`：1 条。收窄入口 `SellerScopedT<"product">` */
export type ProductKeys =
    "product.publish.forbiddenWordHit"

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
    "product": ProductKeys
    "topbar": TopbarKeys
}

/** 本 root 全部 key 的联合（各 `{Ns}Keys` 的并集）。铺到几千条后打字面量会很难受，
 *  所以按 namespace 收窄的入口是 `SellerScopedT`——见 §4.2 末段。 */
export type SellerMessageKey = SellerNamespace[keyof SellerNamespace]

type SellerParamsByKey = {
    "product.publish.forbiddenWordHit": { word: string | number }
    "seller.coupon.rule.rate.noThreshold": { rate: string | number }
    "seller.coupon.rule.rate.noThresholdCapped": { rate: string | number; cap: string | number }
    "seller.coupon.rule.rate.threshold": { threshold: string | number; rate: string | number }
    "seller.coupon.rule.rate.thresholdCapped": { threshold: string | number; rate: string | number; cap: string | number }
    "seller.coupon.rule.reduction.noThreshold": { discount: string | number }
    "seller.coupon.rule.reduction.threshold": { threshold: string | number; discount: string | number }
}

export type SellerParamsOf<K extends SellerMessageKey> = K extends keyof SellerParamsByKey
    ? SellerParamsByKey[K]
    : undefined

/**
 * 本端调用侧的 `t` 形状：key 收在「本端 catalog ∪ app-kit 共享 catalog」，参数按各自的
 * `ParamsOf` 推。无参消息的参数位是 `undefined`，多塞一个就是编译错误。
 * 带参消息**漏传**参数不拦（那是可选位）——后果是模板原样显示（`formatMessage` 的降级），
 * 要连漏传一起拦得按 key 分发参数元组，等第一条真被漏过的消息出现再造。
 * 这是 §5.5 分工表里唯一那条「编译期」保证在三端兑现的地方。
 */
export type SellerTranslate = <K extends SellerMessageKey | AppKitMessageKey>(
    key: K,
    params?: K extends SellerMessageKey
        ? SellerParamsOf<K>
        : AppKitParamsOf<Extract<K, AppKitMessageKey>>,
) => string

/**
 * 按 namespace 收窄的 `t`：`useT("nav")` 拿它。key 位只收那一个 namespace 的 key，
 * 所以打错 key 的报错只列本 namespace 的候选，而不是整份联合。
 * 要 app-kit 的共享文案（`appKit.*` / `error.*`）就用不传 namespace 的整份 `t`。
 */
export type SellerScopedT<N extends keyof SellerNamespace> = <K extends SellerNamespace[N]>(
    key: K,
    params?: SellerParamsOf<K>,
) => string

/** 一种语言里 SellerMessageKey 的每一个都得有一句 */
export type SellerCatalog = { [K in SellerMessageKey]: string }
