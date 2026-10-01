// 生成物，别手改：pnpm gen:i18n（判据与清单见 scripts/i18n-codegen.mjs、docs/conventions/i18n.md §5.5）
// 来源：apps/web/src/locales/{zh-CN, en-US}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致。这条保证属于生成期，手改这份文件不会让它成立。

import type { AppKitMessageKey, AppKitParamsOf } from "@shop/app-kit"

export type WebMessageKey =
    "app.description" |
    "app.title" |
    "common.action.backHome" |
    "common.loadFailed.banners" |
    "common.loadFailed.categoryNav" |
    "common.loadFailed.feed" |
    "common.loadFailed.profile" |
    "common.loadFailed.recommend" |
    "common.loadFailed.shopBar" |
    "common.notFound.description" |
    "common.notFound.title" |
    "web.footer.brand" |
    "web.footer.group.selling" |
    "web.footer.group.shopping" |
    "web.footer.home" |
    "web.footer.openShop" |
    "web.footer.sellerCenter" |
    "web.footer.tagline" |
    "web.header.account" |
    "web.header.cart" |
    "web.header.login" |
    "web.header.logout" |
    "web.header.region" |
    "web.login.agreementPrefix" |
    "web.login.and" |
    "web.login.autoRegister" |
    "web.login.close" |
    "web.login.privacy" |
    "web.login.qrComing" |
    "web.login.qrHint" |
    "web.login.qrTitle" |
    "web.login.title" |
    "web.login.userAgreement" |
    "web.nav.apparel" |
    "web.nav.appliances" |
    "web.nav.baby" |
    "web.nav.bags" |
    "web.nav.beauty" |
    "web.nav.category" |
    "web.nav.computers" |
    "web.nav.diapers" |
    "web.nav.digital" |
    "web.nav.drinks" |
    "web.nav.food" |
    "web.nav.formula" |
    "web.nav.fresh" |
    "web.nav.furniture" |
    "web.nav.home" |
    "web.nav.homeCategory" |
    "web.nav.kitchen" |
    "web.nav.makeup" |
    "web.nav.men" |
    "web.nav.openShop" |
    "web.nav.personalCare" |
    "web.nav.phones" |
    "web.nav.sell" |
    "web.nav.sellerCenter" |
    "web.nav.shoes" |
    "web.nav.skincare" |
    "web.nav.snacks" |
    "web.nav.textiles" |
    "web.nav.toys" |
    "web.nav.women" |
    "web.security.changePassword.confirm" |
    "web.security.changePassword.confirmPlaceholder" |
    "web.security.changePassword.current" |
    "web.security.changePassword.currentPlaceholder" |
    "web.security.changePassword.currentRequired" |
    "web.security.changePassword.description" |
    "web.security.changePassword.mismatch" |
    "web.security.changePassword.next" |
    "web.security.changePassword.nextPlaceholder" |
    "web.security.changePassword.nextTooShort" |
    "web.security.changePassword.submit" |
    "web.security.changePassword.success" |
    "web.security.changePassword.title" |
    "web.security.devices.current" |
    "web.security.devices.description" |
    "web.security.devices.empty.description" |
    "web.security.devices.empty.title" |
    "web.security.devices.logout" |
    "web.security.devices.logoutAll" |
    "web.security.devices.logoutAllAction" |
    "web.security.devices.logoutAllConfirm" |
    "web.security.devices.logoutAllTitle" |
    "web.security.devices.logoutFailed" |
    "web.security.devices.logoutOne" |
    "web.security.devices.title" |
    "web.security.devices.unknownIp" |
    "web.security.title"

type WebParamsByKey = Record<never, never>

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

/** 一种语言里 WebMessageKey 的每一个都得有一句 */
export type WebCatalog = { [K in WebMessageKey]: string }
