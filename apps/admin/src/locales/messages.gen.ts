// 生成物，别手改：pnpm gen:i18n（判据与清单见 scripts/i18n-codegen.mjs、docs/conventions/i18n.md §5.5）
// 来源：apps/admin/src/locales/{zh-CN, en-US}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致。这条保证属于生成期，手改这份文件不会让它成立。

import type { AppKitMessageKey, AppKitParamsOf } from "@shop/app-kit/i18n"

/** namespace `account`：2 条。收窄入口 `AdminScopedT<"account">` */
export type AccountKeys =
    "admin.account.description" |
    "admin.account.logout"

/** namespace `app`：1 条。收窄入口 `AdminScopedT<"app">` */
export type AppKeys =
    "app.title"

/** namespace `common`：4 条。收窄入口 `AdminScopedT<"common">` */
export type CommonKeys =
    "common.notFound.title" |
    "common.notFound.description" |
    "common.action.backHome" |
    "common.loadFailed.categoryTree"

/** namespace `layout`：1 条。收窄入口 `AdminScopedT<"layout">` */
export type LayoutKeys =
    "admin.layout.brand"

/** namespace `login`：12 条。收窄入口 `AdminScopedT<"login">` */
export type LoginKeys =
    "admin.login.logo" |
    "admin.login.title" |
    "admin.login.subtitle" |
    "admin.login.contents" |
    "admin.login.restricted" |
    "admin.login.employeeNo" |
    "admin.login.password" |
    "admin.login.employeeNoRequired" |
    "admin.login.passwordRequired" |
    "admin.login.submit" |
    "admin.login.invalidCredentials" |
    "admin.login.failed"

/** namespace `nav`：14 条。收窄入口 `AdminScopedT<"nav">` */
export type NavKeys =
    "admin.nav.account" |
    "admin.nav.account.section.0" |
    "admin.nav.merchant" |
    "admin.nav.merchant.section.0" |
    "admin.nav.product" |
    "admin.nav.product.section.0" |
    "admin.nav.coupon-ops.section.0" |
    "admin.nav.cms" |
    "admin.nav.cms.section.0" |
    "admin.nav.coupon-ops" |
    "admin.nav.logistics" |
    "admin.nav.logistics.section.0" |
    "admin.nav.audit" |
    "admin.nav.audit.section.0"

/** namespace `page`：11 条。收窄入口 `AdminScopedT<"page">` */
export type PageKeys =
    "admin.page.home" |
    "admin.page.accounts.users" |
    "admin.page.accounts.staff" |
    "admin.page.categories" |
    "admin.page.coupon-ops" |
    "admin.page.cms.nav" |
    "admin.page.cms.banner" |
    "admin.page.cms.recommend-tab" |
    "admin.page.shops" |
    "admin.page.logistics" |
    "admin.page.audits"

/**
 * namespace 名 → 该 namespace 的 key 类型。「有哪些 namespace 可选」的唯一真相，
 *  也是收窄形态 `AdminScopedT` 的入口。
 */
export type AdminNamespace = {
    "account": AccountKeys
    "app": AppKeys
    "common": CommonKeys
    "layout": LayoutKeys
    "login": LoginKeys
    "nav": NavKeys
    "page": PageKeys
}

/** 本 root 全部 key 的联合（各 `{Ns}Keys` 的并集）。铺到几千条后打字面量会很难受，
 *  所以按 namespace 收窄的入口是 `AdminScopedT`——见 §4.2 末段。 */
export type AdminMessageKey = AdminNamespace[keyof AdminNamespace]

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

/**
 * 按 namespace 收窄的 `t`：`useT("nav")` 拿它。key 位只收那一个 namespace 的 key，
 * 所以打错 key 的报错只列本 namespace 的候选，而不是整份联合。
 * 要 app-kit 的共享文案（`appKit.*` / `error.*`）就用不传 namespace 的整份 `t`。
 */
export type AdminScopedT<N extends keyof AdminNamespace> = <K extends AdminNamespace[N]>(
    key: K,
    params?: AdminParamsOf<K>,
) => string

/** 一种语言里 AdminMessageKey 的每一个都得有一句 */
export type AdminCatalog = { [K in AdminMessageKey]: string }
