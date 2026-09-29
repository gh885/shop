// 生成物，别手改：pnpm gen:i18n（判据与清单见 scripts/i18n-codegen.mjs、docs/conventions/i18n.md §5.5）
// 来源：apps/admin/src/locales/{zh-CN, en-US}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致。这条保证属于生成期，手改这份文件不会让它成立。

import type { AppKitMessageKey, AppKitParamsOf } from "@shop/app-kit"

export type AdminMessageKey =
    "admin.account.description" |
    "admin.account.logout" |
    "admin.layout.brand" |
    "admin.login.contents" |
    "admin.login.employeeNo" |
    "admin.login.employeeNoRequired" |
    "admin.login.failed" |
    "admin.login.invalidCredentials" |
    "admin.login.logo" |
    "admin.login.password" |
    "admin.login.passwordRequired" |
    "admin.login.restricted" |
    "admin.login.submit" |
    "admin.login.subtitle" |
    "admin.login.title" |
    "admin.nav.account" |
    "admin.nav.account.section.0" |
    "admin.nav.audit" |
    "admin.nav.audit.section.0" |
    "admin.nav.cms" |
    "admin.nav.cms.section.0" |
    "admin.nav.coupon-ops" |
    "admin.nav.coupon-ops.section.0" |
    "admin.nav.logistics" |
    "admin.nav.logistics.section.0" |
    "admin.nav.merchant" |
    "admin.nav.merchant.section.0" |
    "admin.nav.product" |
    "admin.nav.product.section.0" |
    "admin.page.accounts.staff" |
    "admin.page.accounts.users" |
    "admin.page.audits" |
    "admin.page.categories" |
    "admin.page.cms.banner" |
    "admin.page.cms.nav" |
    "admin.page.cms.recommend-tab" |
    "admin.page.coupon-ops" |
    "admin.page.home" |
    "admin.page.logistics" |
    "admin.page.shops" |
    "app.description" |
    "app.title" |
    "common.action.backHome" |
    "common.locale.enUS" |
    "common.locale.switch" |
    "common.locale.zhCN" |
    "common.notFound.description" |
    "common.notFound.title"

type AdminParamsByKey = Record<never, never>

export type AdminParamsOf<K extends AdminMessageKey> = K extends keyof AdminParamsByKey
    ? AdminParamsByKey[K]
    : undefined

/**
 * 本端调用侧的 `t` 形状：key 收在「本端 catalog ∪ app-kit 共享 catalog」，参数按各自的
 * `ParamsOf` 推。无参消息的参数位是 `undefined`，多塞一个就是编译错误。
 * 带参消息**漏传**参数不拦（那是可选位）——后果是模板原样显示（`formatMessage` 的降级），
 * 要连漏传一起拦得按 key 分发参数元组，等第一条真被漏过的消息出现再造。
 * 这是 §5.5 分工表里唯一那条「编译期」保证在三端兑现的地方。
 */
export type AdminTranslate = <K extends AdminMessageKey | AppKitMessageKey>(
    key: K,
    params?: K extends AdminMessageKey
        ? AdminParamsOf<K>
        : AppKitParamsOf<Extract<K, AppKitMessageKey>>,
) => string

/** 一种语言里 AdminMessageKey 的每一个都得有一句 */
export type AdminCatalog = { [K in AdminMessageKey]: string }
