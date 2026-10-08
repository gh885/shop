// 生成物，别手改：pnpm i18n:gen（判据与清单见 scripts/i18n-codegen.mjs、docs/conventions/i18n.md）
// 来源：apps/admin/src/locales/{en-US, zh-Hans-CN}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致。这条保证属于生成期，手改这份文件不会让它成立。

import type { AppKitMessageKey, AppKitParamsOf } from "@shop/app-kit/i18n"

/** namespace `account`：55 条。收窄入口 `AdminScopedT<"account">` */
export type AccountKeys =
    "account.description" |
    "account.logout" |
    "account.status.ACTIVE" |
    "account.status.DISABLED" |
    "account.form.err.employeeNoRequired" |
    "account.form.err.employeeNoPattern" |
    "account.role.updated" |
    "account.role.failed" |
    "account.staff.created" |
    "account.staff.failed" |
    "account.statusUpdate.done" |
    "account.statusUpdate.failed" |
    "account.col.phone" |
    "account.col.nickname" |
    "account.col.status" |
    "account.col.lastLogin" |
    "account.col.registeredAt" |
    "account.col.employeeNo" |
    "account.col.displayName" |
    "account.col.role" |
    "account.col.createdAt" |
    "account.filter.keyword" |
    "account.list.empty" |
    "account.users.title" |
    "account.users.description" |
    "account.staff.title" |
    "account.staff.description" |
    "account.role.SUPER_ADMIN" |
    "account.role.REVIEWER" |
    "account.role.OPS" |
    "account.role.selfLocked" |
    "account.role.none" |
    "account.role.action" |
    "account.role.dialogTitle" |
    "account.role.targetLabel" |
    "account.role.summary" |
    "account.role.summaryNamed" |
    "account.role.submitting" |
    "account.role.submit" |
    "account.statusAction.enable" |
    "account.statusAction.disable" |
    "account.statusAction.enableTitle" |
    "account.statusAction.disableTitle" |
    "account.statusAction.enableConfirm" |
    "account.statusAction.disableConfirm" |
    "account.staff.create" |
    "account.staff.dialogTitle" |
    "account.staff.employeeNo" |
    "account.staff.employeeNoPlaceholder" |
    "account.staff.displayName" |
    "account.staff.displayNamePlaceholder" |
    "account.staff.password" |
    "account.staff.passwordPlaceholder" |
    "account.staff.role" |
    "account.staff.submit"

/** namespace `app`：1 条。收窄入口 `AdminScopedT<"app">` */
export type AppKeys =
    "app.title"

/** namespace `audit`：41 条。收窄入口 `AdminScopedT<"audit">` */
export type AuditKeys =
    "audit.action.account.user.status_changed" |
    "audit.action.account.staff.status_changed" |
    "audit.action.account.staff.created" |
    "audit.action.account.staff.role_changed" |
    "audit.action.coupon.user_coupon.voided" |
    "audit.action.shop.review.decided" |
    "audit.action.shop.trading_suspended" |
    "audit.action.shop.trading_resumed" |
    "audit.action.logistics.shipment_issue.resolved" |
    "audit.action.logistics.tracking.written" |
    "audit.target.USER" |
    "audit.target.STAFF" |
    "audit.target.USER_COUPON" |
    "audit.target.SHOP" |
    "audit.target.SHOP_REVIEW" |
    "audit.target.SHIPMENT_ISSUE" |
    "audit.target.SHIPMENT" |
    "audit.export.failed" |
    "audit.page.title" |
    "audit.page.description" |
    "audit.page.empty" |
    "audit.field.time" |
    "audit.field.action" |
    "audit.field.operator" |
    "audit.field.target" |
    "audit.field.targetType" |
    "audit.field.detail" |
    "audit.operator.unknown" |
    "audit.filter.operatorId" |
    "audit.filter.targetId" |
    "audit.filter.from" |
    "audit.filter.to" |
    "audit.filter.apply" |
    "audit.csv.operatorId" |
    "audit.csv.targetId" |
    "audit.export.action" |
    "audit.export.dialogTitle" |
    "audit.export.dialogDescription" |
    "audit.export.confirm" |
    "audit.export.overLimit" |
    "audit.export.fileName"

/** namespace `category`：93 条。收窄入口 `AdminScopedT<"category">` */
export type CategoryKeys =
    "category.title" |
    "category.description" |
    "category.addAttribute" |
    "category.kind.SPEC" |
    "category.kind.PARAM" |
    "category.attrStatus.ENABLED" |
    "category.attrStatus.DISABLED" |
    "category.source.PLATFORM" |
    "category.source.SELLER" |
    "category.kindOption.SPEC" |
    "category.kindOption.PARAM" |
    "category.rules.required" |
    "category.rules.allowCustom" |
    "category.rules.allowImage" |
    "category.rules.none" |
    "category.kindLocked" |
    "category.empty.title" |
    "category.empty.description" |
    "category.action.edit" |
    "category.action.collapse" |
    "category.action.enable" |
    "category.action.disable" |
    "category.values.count" |
    "category.values.emptyHint" |
    "category.values.addValue" |
    "category.values.rename" |
    "category.values.renameAria" |
    "category.form.submitAdd" |
    "category.form.submitSave" |
    "category.form.submitAddValue" |
    "category.form.name.label" |
    "category.form.name.placeholder" |
    "category.form.kind.label" |
    "category.form.required.label" |
    "category.form.required.hint" |
    "category.form.allowCustom.label" |
    "category.form.allowCustom.hint" |
    "category.form.allowImage.label" |
    "category.form.allowImage.hint" |
    "category.form.value.label" |
    "category.form.value.placeholder" |
    "category.form.image.label" |
    "category.form.image.placeholder" |
    "category.form.image.renameHint" |
    "category.created" |
    "category.failed" |
    "category.updated" |
    "category.updateFailed" |
    "category.statusUpdated" |
    "category.statusUpdateFailed" |
    "category.orderUpdated" |
    "category.orderUpdateFailed" |
    "category.attr.created" |
    "category.attr.createFailed" |
    "category.attr.updated" |
    "category.attr.updateFailed" |
    "category.attr.statusUpdated" |
    "category.attr.statusUpdateFailed" |
    "category.attrValue.created" |
    "category.attrValue.createFailed" |
    "category.attrValue.updated" |
    "category.attrValue.updateFailed" |
    "category.status.ENABLED" |
    "category.status.DISABLED" |
    "category.levelBadge" |
    "category.confirm.disable.title" |
    "category.confirm.disable.description" |
    "category.hint.groupOnly" |
    "category.hint.mountPoint" |
    "category.moveUp" |
    "category.moveDown" |
    "category.children.title" |
    "category.children.disabledHint" |
    "category.children.add" |
    "category.form.categoryName.label" |
    "category.form.icon.label" |
    "category.form.icon.placeholder" |
    "category.form.categoryName.placeholderChild" |
    "category.form.categoryName.placeholderRoot" |
    "category.form.submitCreate" |
    "category.form.cancel" |
    "category.page.title" |
    "category.page.description" |
    "category.tree.title" |
    "category.tree.root" |
    "category.addRoot" |
    "category.rootEmpty.title" |
    "category.rootEmpty.description" |
    "category.pickEmpty.title" |
    "category.pickEmpty.description" |
    "category.form.err.categoryNameRequired" |
    "category.form.err.attrNameRequired" |
    "category.form.err.attrValueRequired"

/** namespace `cms`：114 条。收窄入口 `AdminScopedT<"cms">` */
export type CmsKeys =
    "cms.targetType.NONE" |
    "cms.targetType.PRODUCT" |
    "cms.targetType.CATEGORY" |
    "cms.targetType.CAMPAIGN" |
    "cms.targetType.SEARCH" |
    "cms.targetType.URL" |
    "cms.status.ENABLED" |
    "cms.status.DISABLED" |
    "cms.form.err.slotRequired" |
    "cms.form.err.navKeyRequired" |
    "cms.form.err.titleRequired" |
    "cms.form.err.imageUrlRequired" |
    "cms.form.err.endBeforeStart" |
    "cms.form.err.groupNameRequired" |
    "cms.form.err.subsLimit" |
    "cms.form.err.subsInvalid" |
    "cms.form.err.tabNameRequired" |
    "cms.form.err.sortOrderInt" |
    "cms.banner.created" |
    "cms.banner.updated" |
    "cms.banner.failed" |
    "cms.banner.statusUpdated" |
    "cms.banner.statusFailed" |
    "cms.nav.created" |
    "cms.nav.updated" |
    "cms.nav.failed" |
    "cms.nav.statusUpdated" |
    "cms.nav.statusFailed" |
    "cms.tab.created" |
    "cms.tab.updated" |
    "cms.tab.failed" |
    "cms.tab.statusUpdated" |
    "cms.tab.statusFailed" |
    "cms.form.save" |
    "cms.field.slot" |
    "cms.field.navKey" |
    "cms.field.title" |
    "cms.field.tabName" |
    "cms.form.subtitle" |
    "cms.form.imageUrl" |
    "cms.form.sortOrder" |
    "cms.form.sortOrderHint" |
    "cms.form.targetType" |
    "cms.form.target" |
    "cms.form.targetPlaceholder" |
    "cms.form.startAt" |
    "cms.form.startAtHint" |
    "cms.form.endAt" |
    "cms.form.endAtHint" |
    "cms.banner.form.createTitle" |
    "cms.banner.form.editTitle" |
    "cms.banner.form.slotPlaceholder" |
    "cms.banner.form.linkLabel" |
    "cms.banner.form.linkPlaceholder" |
    "cms.nav.form.createTitle" |
    "cms.nav.form.editTitle" |
    "cms.nav.form.navKeyHint" |
    "cms.nav.form.iconKeyLabel" |
    "cms.nav.form.iconKeyPlaceholder" |
    "cms.nav.form.iconKeyHint" |
    "cms.nav.form.subsTitle" |
    "cms.nav.form.subsDesc" |
    "cms.nav.subs.groupPlaceholder" |
    "cms.nav.subs.itemPlaceholder" |
    "cms.nav.subs.removeItemAria" |
    "cms.nav.subs.addItem" |
    "cms.nav.subs.addGroup" |
    "cms.nav.subs.moveUp" |
    "cms.nav.subs.moveDown" |
    "cms.nav.subs.removeGroup" |
    "cms.tab.form.createTitle" |
    "cms.tab.form.editTitle" |
    "cms.tab.form.namePlaceholder" |
    "cms.tab.form.targetPlaceholder" |
    "cms.tab.form.isDefaultLabel" |
    "cms.tab.form.defaultHint" |
    "cms.col.sortOrder" |
    "cms.col.targetType" |
    "cms.col.target" |
    "cms.col.status" |
    "cms.banner.col.image" |
    "cms.banner.col.window" |
    "cms.nav.col.subs" |
    "cms.tab.defaultBadge" |
    "cms.row.edit" |
    "cms.row.disable" |
    "cms.row.enable" |
    "cms.row.confirmDisableText" |
    "cms.row.confirmEnableText" |
    "cms.row.disableTitle" |
    "cms.row.enableTitle" |
    "cms.banner.disableHint" |
    "cms.banner.enableHint" |
    "cms.nav.disableHint" |
    "cms.nav.enableHint" |
    "cms.tab.disableHint" |
    "cms.tab.enableHint" |
    "cms.banner.page.title" |
    "cms.banner.page.description" |
    "cms.banner.page.empty" |
    "cms.banner.create" |
    "cms.nav.page.title" |
    "cms.nav.page.description" |
    "cms.nav.page.empty" |
    "cms.nav.create" |
    "cms.tab.page.title" |
    "cms.tab.page.description" |
    "cms.tab.page.empty" |
    "cms.tab.create" |
    "cms.display.window.nowForever" |
    "cms.display.window.now" |
    "cms.display.window.forever" |
    "cms.display.window.range" |
    "cms.display.subsSummary"

/** namespace `common`：9 条。收窄入口 `AdminScopedT<"common">` */
export type CommonKeys =
    "common.notFound.title" |
    "common.notFound.description" |
    "common.action.backHome" |
    "common.action.cancel" |
    "common.col.actions" |
    "common.filter.all" |
    "common.filter.aria" |
    "common.filter.status" |
    "common.loadFailed.categoryTree"

/** namespace `coupon`：26 条。收窄入口 `AdminScopedT<"coupon">` */
export type CouponKeys =
    "coupon.status.UNUSED" |
    "coupon.status.LOCKED" |
    "coupon.status.USED" |
    "coupon.status.EXPIRED" |
    "coupon.status.VOID" |
    "coupon.ops.void.done" |
    "coupon.ops.void.failed" |
    "coupon.col.name" |
    "coupon.col.shopName" |
    "coupon.col.userId" |
    "coupon.col.discount" |
    "coupon.col.status" |
    "coupon.col.source" |
    "coupon.col.validity" |
    "coupon.col.orderId" |
    "coupon.source.CLAIM" |
    "coupon.source.REFUND_RETURN" |
    "coupon.ops.title" |
    "coupon.ops.description" |
    "coupon.ops.empty" |
    "coupon.ops.filter.userId" |
    "coupon.ops.filter.shopId" |
    "coupon.ops.void.blocked" |
    "coupon.ops.void.action" |
    "coupon.ops.void.dialogTitle" |
    "coupon.ops.void.confirm"

/** namespace `layout`：1 条。收窄入口 `AdminScopedT<"layout">` */
export type LayoutKeys =
    "layout.brand"

/** namespace `login`：12 条。收窄入口 `AdminScopedT<"login">` */
export type LoginKeys =
    "login.logo" |
    "login.title" |
    "login.subtitle" |
    "login.contents" |
    "login.restricted" |
    "login.employeeNo" |
    "login.password" |
    "login.employeeNoRequired" |
    "login.passwordRequired" |
    "login.signIn" |
    "login.invalidCredentials" |
    "login.failed"

/** namespace `logistics`：20 条。收窄入口 `AdminScopedT<"logistics">` */
export type LogisticsKeys =
    "logistics.resolve.done" |
    "logistics.resolve.failed" |
    "logistics.issue.PICKUP_TIMEOUT" |
    "logistics.issue.TRANSIT_STALLED" |
    "logistics.issue.DELIVERY_STALLED" |
    "logistics.col.type" |
    "logistics.col.shipment" |
    "logistics.col.detail" |
    "logistics.col.detectedAt" |
    "logistics.resolve.action" |
    "logistics.resolve.dialogTitle" |
    "logistics.resolve.summary" |
    "logistics.resolve.noDetail" |
    "logistics.resolve.noteLabel" |
    "logistics.resolve.notePlaceholder" |
    "logistics.resolve.submitting" |
    "logistics.resolve.submit" |
    "logistics.page.title" |
    "logistics.page.description" |
    "logistics.page.empty"

/** namespace `nav`：14 条。收窄入口 `AdminScopedT<"nav">` */
export type NavKeys =
    "nav.account" |
    "nav.account.section.0" |
    "nav.merchant" |
    "nav.merchant.section.0" |
    "nav.product" |
    "nav.product.section.0" |
    "nav.coupon-ops.section.0" |
    "nav.cms" |
    "nav.cms.section.0" |
    "nav.coupon-ops" |
    "nav.logistics" |
    "nav.logistics.section.0" |
    "nav.audit" |
    "nav.audit.section.0"

/** namespace `page`：11 条。收窄入口 `AdminScopedT<"page">` */
export type PageKeys =
    "page.home" |
    "page.accounts.users" |
    "page.accounts.staff" |
    "page.categories" |
    "page.coupon-ops" |
    "page.cms.nav" |
    "page.cms.banner" |
    "page.cms.recommend-tab" |
    "page.shops" |
    "page.logistics" |
    "page.audits"

/** namespace `shopOps`：26 条。收窄入口 `AdminScopedT<"shopOps">` */
export type ShopOpsKeys =
    "shopOps.status.PENDING_REVIEW" |
    "shopOps.status.ACTIVE" |
    "shopOps.status.REJECTED" |
    "shopOps.status.DISABLED" |
    "shopOps.suspend.done" |
    "shopOps.suspend.failed" |
    "shopOps.resume.done" |
    "shopOps.resume.failed" |
    "shopOps.page.title" |
    "shopOps.page.description" |
    "shopOps.page.empty" |
    "shopOps.col.name" |
    "shopOps.col.ownerId" |
    "shopOps.col.status" |
    "shopOps.col.createdAt" |
    "shopOps.filter.keywordLabel" |
    "shopOps.suspend.disabled" |
    "shopOps.suspend.dialogTitle" |
    "shopOps.suspend.dialogDescription" |
    "shopOps.suspend.confirm" |
    "shopOps.suspend.action" |
    "shopOps.resume.disabled" |
    "shopOps.resume.dialogTitle" |
    "shopOps.resume.dialogDescription" |
    "shopOps.resume.confirm" |
    "shopOps.resume.action"

/** namespace `shopReview`：26 条。收窄入口 `AdminScopedT<"shopReview">` */
export type ShopReviewKeys =
    "shopReview.status.PENDING" |
    "shopReview.status.APPROVED" |
    "shopReview.status.REJECTED" |
    "shopReview.phone.failed" |
    "shopReview.approve.done" |
    "shopReview.reject.done" |
    "shopReview.failed" |
    "shopReview.page.title" |
    "shopReview.page.description" |
    "shopReview.page.empty" |
    "shopReview.col.shopName" |
    "shopReview.col.ownerPhone" |
    "shopReview.col.status" |
    "shopReview.col.reason" |
    "shopReview.col.createdAt" |
    "shopReview.col.decidedAt" |
    "shopReview.approve.action" |
    "shopReview.approve.title" |
    "shopReview.approve.description" |
    "shopReview.approve.confirm" |
    "shopReview.reject.action" |
    "shopReview.reject.title" |
    "shopReview.reject.description" |
    "shopReview.reject.reasonLabel" |
    "shopReview.reject.reasonPlaceholder" |
    "shopReview.reject.submit"

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
    "logistics": LogisticsKeys
    "nav": NavKeys
    "page": PageKeys
    "shopOps": ShopOpsKeys
    "shopReview": ShopReviewKeys
}

/** 本 root 全部 key 的联合（各 `{Ns}Keys` 的并集）。铺到几千条后打字面量会很难受，
 *  所以按 namespace 收窄的入口是 `AdminScopedT`——见 按资源文件收窄 key 的约定。 */
export type AdminMessageKey = AdminNamespace[keyof AdminNamespace]

export type AdminParamsByKey = {
    "account.role.summary": { employeeNo: string | number; from: string | number; to: string | number }
    "account.role.summaryNamed": { employeeNo: string | number; name: string | number; from: string | number; to: string | number }
    "account.statusAction.disableConfirm": { target: string | number }
    "account.statusAction.enableConfirm": { target: string | number }
    "audit.export.dialogDescription": { limit: string | number }
    "audit.export.fileName": { stamp: string | number }
    "audit.export.overLimit": { total: string | number; limit: string | number }
    "category.confirm.disable.title": { name: string | number }
    "category.kindLocked": { kind: string | number }
    "category.levelBadge": { level: string | number }
    "category.values.count": { count: string | number }
    "category.values.renameAria": { value: string | number }
    "cms.display.subsSummary": { groups: string | number; items: string | number }
    "cms.display.window.range": { from: string | number; to: string | number }
    "cms.form.err.subsLimit": { max: string | number }
    "cms.nav.form.navKeyHint": { keys: string | number }
    "cms.nav.subs.addGroup": { current: string | number; max: string | number }
    "cms.nav.subs.groupPlaceholder": { index: string | number }
    "cms.nav.subs.removeItemAria": { value: string | number }
    "cms.row.disableTitle": { withNoun: "other" | "yes"; noun: string | number; label: string | number }
    "cms.row.enableTitle": { withNoun: "other" | "yes"; noun: string | number; label: string | number }
    "cms.tab.form.defaultHint": { count: string | number }
    "common.filter.all": { label: string | number }
    "common.filter.aria": { label: string | number }
    "coupon.ops.void.confirm": { name: string | number }
    "logistics.resolve.summary": { type: string | number; detail: string | number }
    "shopOps.resume.dialogDescription": { name: string | number }
    "shopOps.suspend.dialogDescription": { name: string | number }
    "shopReview.approve.done": { shopName: string | number }
    "shopReview.approve.title": { name: string | number }
    "shopReview.reject.done": { shopName: string | number }
    "shopReview.reject.title": { name: string | number }
}

export type AdminParamsOf<K extends AdminMessageKey> = K extends keyof AdminParamsByKey
    ? AdminParamsByKey[K]
    : undefined

/**
 * 本端调用侧的 `t` 形状：key 收在「本端 catalog ∪ app-kit 共享 catalog」，参数按各自的
 * `ParamsOf` 推。无参消息的参数位是 `undefined`，多塞一个就是编译错误。
 * 带参消息使用必需参数元组，漏传参数在编译时失败。
 * ICU 类型由 codegen 生成；运行时交给 i18next-icu。
 * 这是 类型与资源生成规则 分工表里唯一那条「编译期」保证在三端兑现的地方。
 */
export type AdminTranslate = <K extends AdminMessageKey | AppKitMessageKey>(
    key: K,
    ...args: (K extends AdminMessageKey ? AdminParamsOf<K> : AppKitParamsOf<Extract<K, AppKitMessageKey>>) extends undefined
        ? [] : [params: K extends AdminMessageKey ? AdminParamsOf<K> : AppKitParamsOf<Extract<K, AppKitMessageKey>>]
) => string

/**
 * 按 namespace 收窄的 `t`：`useT("nav")` 拿它。key 位只收那一个 namespace 的 key，
 * 所以打错 key 的报错只列本 namespace 的候选，而不是整份联合。
 * 要 app-kit 的共享文案（`login.*` / `error.*`）就用不传 namespace 的整份 `t`。
 */
export type AdminScopedT<N extends keyof AdminNamespace> = <K extends AdminNamespace[N]>(
    key: K,
    ...args: AdminParamsOf<K> extends undefined ? [] : [params: AdminParamsOf<K>]
) => string

/** 一种语言里 AdminMessageKey 的每一个都得有一句 */
export type AdminCatalog = { [K in AdminMessageKey]: string }
