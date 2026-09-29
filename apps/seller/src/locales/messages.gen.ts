// 生成物，别手改：pnpm gen:i18n（判据与清单见 scripts/i18n-codegen.mjs、docs/conventions/i18n.md §5.5）
// 来源：apps/seller/src/locales/{zh-CN, en-US}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致。这条保证属于生成期，手改这份文件不会让它成立。

import type { AppKitMessageKey, AppKitParamsOf } from "@shop/app-kit"

export type SellerMessageKey =
    "app.description" |
    "app.title" |
    "common.action.backHome" |
    "common.locale.enUS" |
    "common.locale.switch" |
    "common.locale.zhCN" |
    "common.notFound.description" |
    "common.notFound.title" |
    "seller.account.description" |
    "seller.account.logout" |
    "seller.account.notLoggedIn" |
    "seller.layout.brand" |
    "seller.login.headline" |
    "seller.login.pitch" |
    "seller.login.title" |
    "seller.login.welcome" |
    "seller.login.youAreHere" |
    "seller.nav.data" |
    "seller.nav.data.overview" |
    "seller.nav.data.report" |
    "seller.nav.data.section.0" |
    "seller.nav.data.visit" |
    "seller.nav.home" |
    "seller.nav.marketing" |
    "seller.nav.marketing.campaign" |
    "seller.nav.marketing.coupon" |
    "seller.nav.marketing.flash" |
    "seller.nav.marketing.section.0" |
    "seller.nav.product" |
    "seller.nav.product.category" |
    "seller.nav.product.create" |
    "seller.nav.product.list" |
    "seller.nav.product.price" |
    "seller.nav.product.purchase" |
    "seller.nav.product.section.0" |
    "seller.nav.product.section.1" |
    "seller.nav.product.stock" |
    "seller.nav.product.supplier" |
    "seller.nav.service" |
    "seller.nav.shop" |
    "seller.nav.shop.address" |
    "seller.nav.shop.brand" |
    "seller.nav.shop.decoration" |
    "seller.nav.shop.license" |
    "seller.nav.shop.list" |
    "seller.nav.shop.member" |
    "seller.nav.shop.notice" |
    "seller.nav.shop.section.0" |
    "seller.nav.shop.section.1" |
    "seller.nav.trade" |
    "seller.nav.trade.buyershow" |
    "seller.nav.trade.logistics" |
    "seller.nav.trade.order" |
    "seller.nav.trade.refund" |
    "seller.nav.trade.review" |
    "seller.nav.trade.section.0" |
    "seller.nav.trade.section.1" |
    "seller.nav.trade.ship" |
    "seller.nav.trade.shipping" |
    "seller.topbar.help" |
    "seller.topbar.messages" |
    "seller.topbar.rules" |
    "seller.topbar.support"

type SellerParamsByKey = Record<never, never>

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

/** 一种语言里 SellerMessageKey 的每一个都得有一句 */
export type SellerCatalog = { [K in SellerMessageKey]: string }
