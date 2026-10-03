// 生成物，别手改：pnpm gen:i18n（判据与清单见 scripts/i18n-codegen.mjs、docs/conventions/i18n.md §5.5）
// 来源：apps/admin/src/locales/{zh-CN, en-US}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致。这条保证属于生成期，手改这份文件不会让它成立。

import type { AppKitMessageKey, AppKitParamsOf } from "@shop/app-kit/i18n"

/** namespace `account`：4 条。收窄入口 `AdminScopedT<"account">` */
export type AccountKeys =
    "admin.account.description" |
    "admin.account.logout" |
    "admin.account.status.ACTIVE" |
    "admin.account.status.DISABLED"

/** namespace `app`：1 条。收窄入口 `AdminScopedT<"app">` */
export type AppKeys =
    "app.title"

/** namespace `audit`：17 条。收窄入口 `AdminScopedT<"audit">` */
export type AuditKeys =
    "admin.audit.action.account.user.status_changed" |
    "admin.audit.action.account.staff.status_changed" |
    "admin.audit.action.account.staff.created" |
    "admin.audit.action.account.staff.role_changed" |
    "admin.audit.action.coupon.user_coupon.voided" |
    "admin.audit.action.shop.review.decided" |
    "admin.audit.action.shop.trading_suspended" |
    "admin.audit.action.shop.trading_resumed" |
    "admin.audit.action.logistics.shipment_issue.resolved" |
    "admin.audit.action.logistics.tracking.written" |
    "admin.audit.target.USER" |
    "admin.audit.target.STAFF" |
    "admin.audit.target.USER_COUPON" |
    "admin.audit.target.SHOP" |
    "admin.audit.target.SHOP_REVIEW" |
    "admin.audit.target.SHIPMENT_ISSUE" |
    "admin.audit.target.SHIPMENT"

/** namespace `category`：31 条。收窄入口 `AdminScopedT<"category">` */
export type CategoryKeys =
    "admin.category.title" |
    "admin.category.description" |
    "admin.category.addAttribute" |
    "admin.category.empty.title" |
    "admin.category.empty.description" |
    "admin.category.action.edit" |
    "admin.category.action.collapse" |
    "admin.category.action.enable" |
    "admin.category.action.disable" |
    "admin.category.values.count" |
    "admin.category.values.emptyHint" |
    "admin.category.values.addValue" |
    "admin.category.values.rename" |
    "admin.category.values.renameAria" |
    "admin.category.form.submitAdd" |
    "admin.category.form.submitSave" |
    "admin.category.form.submitAddValue" |
    "admin.category.form.name.label" |
    "admin.category.form.name.placeholder" |
    "admin.category.form.kind.label" |
    "admin.category.form.required.label" |
    "admin.category.form.required.hint" |
    "admin.category.form.allowCustom.label" |
    "admin.category.form.allowCustom.hint" |
    "admin.category.form.allowImage.label" |
    "admin.category.form.allowImage.hint" |
    "admin.category.form.value.label" |
    "admin.category.form.value.placeholder" |
    "admin.category.form.image.label" |
    "admin.category.form.image.placeholder" |
    "admin.category.form.image.renameHint"

/** namespace `cms`：8 条。收窄入口 `AdminScopedT<"cms">` */
export type CmsKeys =
    "admin.cms.targetType.NONE" |
    "admin.cms.targetType.PRODUCT" |
    "admin.cms.targetType.CATEGORY" |
    "admin.cms.targetType.CAMPAIGN" |
    "admin.cms.targetType.SEARCH" |
    "admin.cms.targetType.URL" |
    "admin.cms.status.ENABLED" |
    "admin.cms.status.DISABLED"

/** namespace `common`：4 条。收窄入口 `AdminScopedT<"common">` */
export type CommonKeys =
    "common.notFound.title" |
    "common.notFound.description" |
    "common.action.backHome" |
    "common.loadFailed.categoryTree"

/** namespace `coupon`：5 条。收窄入口 `AdminScopedT<"coupon">` */
export type CouponKeys =
    "admin.coupon.status.UNUSED" |
    "admin.coupon.status.LOCKED" |
    "admin.coupon.status.USED" |
    "admin.coupon.status.EXPIRED" |
    "admin.coupon.status.VOID"

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

/** namespace `shopOps`：4 条。收窄入口 `AdminScopedT<"shopOps">` */
export type ShopOpsKeys =
    "admin.shopOps.status.PENDING_REVIEW" |
    "admin.shopOps.status.ACTIVE" |
    "admin.shopOps.status.REJECTED" |
    "admin.shopOps.status.DISABLED"

/** namespace `shopReview`：3 条。收窄入口 `AdminScopedT<"shopReview">` */
export type ShopReviewKeys =
    "admin.shopReview.status.PENDING" |
    "admin.shopReview.status.APPROVED" |
    "admin.shopReview.status.REJECTED"

/**
 * namespace 名 → 该 namespace 的 key 类型。「有哪些 namespace 可选」的唯一真相，
 *  也是收窄形态 `AdminScopedT` 的入口。
 */
export type AdminNamespace = {
    "account": AccountKeys
    "app": AppKeys
    "audit": AuditKeys
    "category": CategoryKeys
    "cms": CmsKeys
    "common": CommonKeys
    "coupon": CouponKeys
    "layout": LayoutKeys
    "login": LoginKeys
    "nav": NavKeys
    "page": PageKeys
    "shopOps": ShopOpsKeys
    "shopReview": ShopReviewKeys
}

/** 本 root 全部 key 的联合（各 `{Ns}Keys` 的并集）。铺到几千条后打字面量会很难受，
 *  所以按 namespace 收窄的入口是 `AdminScopedT`——见 §4.2 末段。 */
export type AdminMessageKey = AdminNamespace[keyof AdminNamespace]

type AdminParamsByKey = {
    "admin.category.values.count": { count: string | number }
    "admin.category.values.renameAria": { value: string | number }
}

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
