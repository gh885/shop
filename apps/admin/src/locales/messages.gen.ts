// 生成物，别手改：pnpm i18n:gen（判据与清单见 scripts/i18n-codegen.mjs、docs/conventions/i18n.md §5.5）
// 来源：apps/admin/src/locales/{zh-CN, en-US}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致。这条保证属于生成期，手改这份文件不会让它成立。

import type { AppKitMessageKey, AppKitParamsOf } from "@shop/app-kit/i18n"

/** namespace `account`：55 条。收窄入口 `AdminScopedT<"account">` */
export type AccountKeys =
    "admin.account.description" |
    "admin.account.logout" |
    "admin.account.status.ACTIVE" |
    "admin.account.status.DISABLED" |
    "admin.account.form.err.employeeNoRequired" |
    "admin.account.form.err.employeeNoPattern" |
    "admin.account.role.updated" |
    "admin.account.role.failed" |
    "admin.account.staff.created" |
    "admin.account.staff.failed" |
    "admin.account.statusUpdate.done" |
    "admin.account.statusUpdate.failed" |
    "admin.account.col.phone" |
    "admin.account.col.nickname" |
    "admin.account.col.status" |
    "admin.account.col.lastLogin" |
    "admin.account.col.registeredAt" |
    "admin.account.col.employeeNo" |
    "admin.account.col.displayName" |
    "admin.account.col.role" |
    "admin.account.col.createdAt" |
    "admin.account.filter.keyword" |
    "admin.account.list.empty" |
    "admin.account.users.title" |
    "admin.account.users.description" |
    "admin.account.staff.title" |
    "admin.account.staff.description" |
    "admin.account.role.SUPER_ADMIN" |
    "admin.account.role.REVIEWER" |
    "admin.account.role.OPS" |
    "admin.account.role.selfLocked" |
    "admin.account.role.none" |
    "admin.account.role.action" |
    "admin.account.role.dialogTitle" |
    "admin.account.role.targetLabel" |
    "admin.account.role.summary" |
    "admin.account.role.summaryNamed" |
    "admin.account.role.submitting" |
    "admin.account.role.submit" |
    "admin.account.statusAction.enable" |
    "admin.account.statusAction.disable" |
    "admin.account.statusAction.enableTitle" |
    "admin.account.statusAction.disableTitle" |
    "admin.account.statusAction.enableConfirm" |
    "admin.account.statusAction.disableConfirm" |
    "admin.account.staff.create" |
    "admin.account.staff.dialogTitle" |
    "admin.account.staff.employeeNo" |
    "admin.account.staff.employeeNoPlaceholder" |
    "admin.account.staff.displayName" |
    "admin.account.staff.displayNamePlaceholder" |
    "admin.account.staff.password" |
    "admin.account.staff.passwordPlaceholder" |
    "admin.account.staff.role" |
    "admin.account.staff.submit"

/** namespace `app`：1 条。收窄入口 `AdminScopedT<"app">` */
export type AppKeys =
    "app.title"

/** namespace `audit`：41 条。收窄入口 `AdminScopedT<"audit">` */
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
    "admin.audit.target.SHIPMENT" |
    "admin.audit.export.failed" |
    "admin.audit.page.title" |
    "admin.audit.page.description" |
    "admin.audit.page.empty" |
    "admin.audit.field.time" |
    "admin.audit.field.action" |
    "admin.audit.field.operator" |
    "admin.audit.field.target" |
    "admin.audit.field.targetType" |
    "admin.audit.field.detail" |
    "admin.audit.operator.unknown" |
    "admin.audit.filter.operatorId" |
    "admin.audit.filter.targetId" |
    "admin.audit.filter.from" |
    "admin.audit.filter.to" |
    "admin.audit.filter.apply" |
    "admin.audit.csv.operatorId" |
    "admin.audit.csv.targetId" |
    "admin.audit.export.action" |
    "admin.audit.export.dialogTitle" |
    "admin.audit.export.dialogDescription" |
    "admin.audit.export.confirm" |
    "admin.audit.export.overLimit" |
    "admin.audit.export.fileName"

/** namespace `category`：93 条。收窄入口 `AdminScopedT<"category">` */
export type CategoryKeys =
    "admin.category.title" |
    "admin.category.description" |
    "admin.category.addAttribute" |
    "admin.category.kind.SPEC" |
    "admin.category.kind.PARAM" |
    "admin.category.attrStatus.ENABLED" |
    "admin.category.attrStatus.DISABLED" |
    "admin.category.source.PLATFORM" |
    "admin.category.source.SELLER" |
    "admin.category.kindOption.SPEC" |
    "admin.category.kindOption.PARAM" |
    "admin.category.rules.required" |
    "admin.category.rules.allowCustom" |
    "admin.category.rules.allowImage" |
    "admin.category.rules.none" |
    "admin.category.kindLocked" |
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
    "admin.category.form.image.renameHint" |
    "admin.category.created" |
    "admin.category.failed" |
    "admin.category.updated" |
    "admin.category.updateFailed" |
    "admin.category.statusUpdated" |
    "admin.category.statusUpdateFailed" |
    "admin.category.orderUpdated" |
    "admin.category.orderUpdateFailed" |
    "admin.category.attr.created" |
    "admin.category.attr.createFailed" |
    "admin.category.attr.updated" |
    "admin.category.attr.updateFailed" |
    "admin.category.attr.statusUpdated" |
    "admin.category.attr.statusUpdateFailed" |
    "admin.category.attrValue.created" |
    "admin.category.attrValue.createFailed" |
    "admin.category.attrValue.updated" |
    "admin.category.attrValue.updateFailed" |
    "admin.category.status.ENABLED" |
    "admin.category.status.DISABLED" |
    "admin.category.levelBadge" |
    "admin.category.confirm.disable.title" |
    "admin.category.confirm.disable.description" |
    "admin.category.hint.groupOnly" |
    "admin.category.hint.mountPoint" |
    "admin.category.moveUp" |
    "admin.category.moveDown" |
    "admin.category.children.title" |
    "admin.category.children.disabledHint" |
    "admin.category.children.add" |
    "admin.category.form.categoryName.label" |
    "admin.category.form.icon.label" |
    "admin.category.form.icon.placeholder" |
    "admin.category.form.categoryName.placeholderChild" |
    "admin.category.form.categoryName.placeholderRoot" |
    "admin.category.form.submitCreate" |
    "admin.category.form.cancel" |
    "admin.category.page.title" |
    "admin.category.page.description" |
    "admin.category.tree.title" |
    "admin.category.tree.root" |
    "admin.category.addRoot" |
    "admin.category.rootEmpty.title" |
    "admin.category.rootEmpty.description" |
    "admin.category.pickEmpty.title" |
    "admin.category.pickEmpty.description" |
    "admin.category.form.err.categoryNameRequired" |
    "admin.category.form.err.attrNameRequired" |
    "admin.category.form.err.attrValueRequired"

/** namespace `cms`：114 条。收窄入口 `AdminScopedT<"cms">` */
export type CmsKeys =
    "admin.cms.targetType.NONE" |
    "admin.cms.targetType.PRODUCT" |
    "admin.cms.targetType.CATEGORY" |
    "admin.cms.targetType.CAMPAIGN" |
    "admin.cms.targetType.SEARCH" |
    "admin.cms.targetType.URL" |
    "admin.cms.status.ENABLED" |
    "admin.cms.status.DISABLED" |
    "admin.cms.form.err.slotRequired" |
    "admin.cms.form.err.navKeyRequired" |
    "admin.cms.form.err.titleRequired" |
    "admin.cms.form.err.imageUrlRequired" |
    "admin.cms.form.err.endBeforeStart" |
    "admin.cms.form.err.groupNameRequired" |
    "admin.cms.form.err.subsLimit" |
    "admin.cms.form.err.subsInvalid" |
    "admin.cms.form.err.tabNameRequired" |
    "admin.cms.form.err.sortOrderInt" |
    "admin.cms.banner.created" |
    "admin.cms.banner.updated" |
    "admin.cms.banner.failed" |
    "admin.cms.banner.statusUpdated" |
    "admin.cms.banner.statusFailed" |
    "admin.cms.nav.created" |
    "admin.cms.nav.updated" |
    "admin.cms.nav.failed" |
    "admin.cms.nav.statusUpdated" |
    "admin.cms.nav.statusFailed" |
    "admin.cms.tab.created" |
    "admin.cms.tab.updated" |
    "admin.cms.tab.failed" |
    "admin.cms.tab.statusUpdated" |
    "admin.cms.tab.statusFailed" |
    "admin.cms.form.save" |
    "admin.cms.field.slot" |
    "admin.cms.field.navKey" |
    "admin.cms.field.title" |
    "admin.cms.field.tabName" |
    "admin.cms.form.subtitle" |
    "admin.cms.form.imageUrl" |
    "admin.cms.form.sortOrder" |
    "admin.cms.form.sortOrderHint" |
    "admin.cms.form.targetType" |
    "admin.cms.form.target" |
    "admin.cms.form.targetPlaceholder" |
    "admin.cms.form.startAt" |
    "admin.cms.form.startAtHint" |
    "admin.cms.form.endAt" |
    "admin.cms.form.endAtHint" |
    "admin.cms.banner.form.createTitle" |
    "admin.cms.banner.form.editTitle" |
    "admin.cms.banner.form.slotPlaceholder" |
    "admin.cms.banner.form.linkLabel" |
    "admin.cms.banner.form.linkPlaceholder" |
    "admin.cms.nav.form.createTitle" |
    "admin.cms.nav.form.editTitle" |
    "admin.cms.nav.form.navKeyHint" |
    "admin.cms.nav.form.iconKeyLabel" |
    "admin.cms.nav.form.iconKeyPlaceholder" |
    "admin.cms.nav.form.iconKeyHint" |
    "admin.cms.nav.form.subsTitle" |
    "admin.cms.nav.form.subsDesc" |
    "admin.cms.nav.subs.groupPlaceholder" |
    "admin.cms.nav.subs.itemPlaceholder" |
    "admin.cms.nav.subs.removeItemAria" |
    "admin.cms.nav.subs.addItem" |
    "admin.cms.nav.subs.addGroup" |
    "admin.cms.nav.subs.moveUp" |
    "admin.cms.nav.subs.moveDown" |
    "admin.cms.nav.subs.removeGroup" |
    "admin.cms.tab.form.createTitle" |
    "admin.cms.tab.form.editTitle" |
    "admin.cms.tab.form.namePlaceholder" |
    "admin.cms.tab.form.targetPlaceholder" |
    "admin.cms.tab.form.isDefaultLabel" |
    "admin.cms.tab.form.defaultHint" |
    "admin.cms.col.sortOrder" |
    "admin.cms.col.targetType" |
    "admin.cms.col.target" |
    "admin.cms.col.status" |
    "admin.cms.banner.col.image" |
    "admin.cms.banner.col.window" |
    "admin.cms.nav.col.subs" |
    "admin.cms.tab.defaultBadge" |
    "admin.cms.row.edit" |
    "admin.cms.row.disable" |
    "admin.cms.row.enable" |
    "admin.cms.row.confirmDisableText" |
    "admin.cms.row.confirmEnableText" |
    "admin.cms.row.disableTitle" |
    "admin.cms.row.enableTitle" |
    "admin.cms.banner.disableHint" |
    "admin.cms.banner.enableHint" |
    "admin.cms.nav.disableHint" |
    "admin.cms.nav.enableHint" |
    "admin.cms.tab.disableHint" |
    "admin.cms.tab.enableHint" |
    "admin.cms.banner.page.title" |
    "admin.cms.banner.page.description" |
    "admin.cms.banner.page.empty" |
    "admin.cms.banner.create" |
    "admin.cms.nav.page.title" |
    "admin.cms.nav.page.description" |
    "admin.cms.nav.page.empty" |
    "admin.cms.nav.create" |
    "admin.cms.tab.page.title" |
    "admin.cms.tab.page.description" |
    "admin.cms.tab.page.empty" |
    "admin.cms.tab.create" |
    "admin.cms.display.window.nowForever" |
    "admin.cms.display.window.now" |
    "admin.cms.display.window.forever" |
    "admin.cms.display.window.range" |
    "admin.cms.display.subsSummary"

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
    "admin.coupon.status.UNUSED" |
    "admin.coupon.status.LOCKED" |
    "admin.coupon.status.USED" |
    "admin.coupon.status.EXPIRED" |
    "admin.coupon.status.VOID" |
    "admin.coupon.ops.void.done" |
    "admin.coupon.ops.void.failed" |
    "admin.coupon.col.name" |
    "admin.coupon.col.shopName" |
    "admin.coupon.col.userId" |
    "admin.coupon.col.discount" |
    "admin.coupon.col.status" |
    "admin.coupon.col.source" |
    "admin.coupon.col.validity" |
    "admin.coupon.col.orderId" |
    "admin.coupon.source.CLAIM" |
    "admin.coupon.source.REFUND_RETURN" |
    "admin.coupon.ops.title" |
    "admin.coupon.ops.description" |
    "admin.coupon.ops.empty" |
    "admin.coupon.ops.filter.userId" |
    "admin.coupon.ops.filter.shopId" |
    "admin.coupon.ops.void.blocked" |
    "admin.coupon.ops.void.action" |
    "admin.coupon.ops.void.dialogTitle" |
    "admin.coupon.ops.void.confirm"

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

/** namespace `logistics`：20 条。收窄入口 `AdminScopedT<"logistics">` */
export type LogisticsKeys =
    "admin.logistics.resolve.done" |
    "admin.logistics.resolve.failed" |
    "admin.logistics.issue.PICKUP_TIMEOUT" |
    "admin.logistics.issue.TRANSIT_STALLED" |
    "admin.logistics.issue.DELIVERY_STALLED" |
    "admin.logistics.col.type" |
    "admin.logistics.col.shipment" |
    "admin.logistics.col.detail" |
    "admin.logistics.col.detectedAt" |
    "admin.logistics.resolve.action" |
    "admin.logistics.resolve.dialogTitle" |
    "admin.logistics.resolve.summary" |
    "admin.logistics.resolve.noDetail" |
    "admin.logistics.resolve.noteLabel" |
    "admin.logistics.resolve.notePlaceholder" |
    "admin.logistics.resolve.submitting" |
    "admin.logistics.resolve.submit" |
    "admin.logistics.page.title" |
    "admin.logistics.page.description" |
    "admin.logistics.page.empty"

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

/** namespace `shopOps`：26 条。收窄入口 `AdminScopedT<"shopOps">` */
export type ShopOpsKeys =
    "admin.shopOps.status.PENDING_REVIEW" |
    "admin.shopOps.status.ACTIVE" |
    "admin.shopOps.status.REJECTED" |
    "admin.shopOps.status.DISABLED" |
    "admin.shopOps.suspend.done" |
    "admin.shopOps.suspend.failed" |
    "admin.shopOps.resume.done" |
    "admin.shopOps.resume.failed" |
    "admin.shopOps.page.title" |
    "admin.shopOps.page.description" |
    "admin.shopOps.page.empty" |
    "admin.shopOps.col.name" |
    "admin.shopOps.col.ownerId" |
    "admin.shopOps.col.status" |
    "admin.shopOps.col.createdAt" |
    "admin.shopOps.filter.keywordLabel" |
    "admin.shopOps.suspend.disabled" |
    "admin.shopOps.suspend.dialogTitle" |
    "admin.shopOps.suspend.dialogDescription" |
    "admin.shopOps.suspend.confirm" |
    "admin.shopOps.suspend.action" |
    "admin.shopOps.resume.disabled" |
    "admin.shopOps.resume.dialogTitle" |
    "admin.shopOps.resume.dialogDescription" |
    "admin.shopOps.resume.confirm" |
    "admin.shopOps.resume.action"

/** namespace `shopReview`：26 条。收窄入口 `AdminScopedT<"shopReview">` */
export type ShopReviewKeys =
    "admin.shopReview.status.PENDING" |
    "admin.shopReview.status.APPROVED" |
    "admin.shopReview.status.REJECTED" |
    "admin.shopReview.phone.failed" |
    "admin.shopReview.approve.done" |
    "admin.shopReview.reject.done" |
    "admin.shopReview.failed" |
    "admin.shopReview.page.title" |
    "admin.shopReview.page.description" |
    "admin.shopReview.page.empty" |
    "admin.shopReview.col.shopName" |
    "admin.shopReview.col.ownerPhone" |
    "admin.shopReview.col.status" |
    "admin.shopReview.col.reason" |
    "admin.shopReview.col.createdAt" |
    "admin.shopReview.col.decidedAt" |
    "admin.shopReview.approve.action" |
    "admin.shopReview.approve.title" |
    "admin.shopReview.approve.description" |
    "admin.shopReview.approve.confirm" |
    "admin.shopReview.reject.action" |
    "admin.shopReview.reject.title" |
    "admin.shopReview.reject.description" |
    "admin.shopReview.reject.reasonLabel" |
    "admin.shopReview.reject.reasonPlaceholder" |
    "admin.shopReview.reject.submit"

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
 *  所以按 namespace 收窄的入口是 `AdminScopedT`——见 §4.2 末段。 */
export type AdminMessageKey = AdminNamespace[keyof AdminNamespace]

export type AdminParamsByKey = {
    "admin.account.role.summary": { employeeNo: string | number; from: string | number; to: string | number }
    "admin.account.role.summaryNamed": { employeeNo: string | number; name: string | number; from: string | number; to: string | number }
    "admin.account.statusAction.disableConfirm": { target: string | number }
    "admin.account.statusAction.enableConfirm": { target: string | number }
    "admin.audit.export.dialogDescription": { limit: string | number }
    "admin.audit.export.fileName": { stamp: string | number }
    "admin.audit.export.overLimit": { total: string | number; limit: string | number }
    "admin.category.confirm.disable.title": { name: string | number }
    "admin.category.kindLocked": { kind: string | number }
    "admin.category.levelBadge": { level: string | number }
    "admin.category.values.count": { count: string | number }
    "admin.category.values.renameAria": { value: string | number }
    "admin.cms.display.subsSummary": { groups: string | number; items: string | number }
    "admin.cms.display.window.range": { from: string | number; to: string | number }
    "admin.cms.form.err.subsLimit": { max: string | number }
    "admin.cms.nav.form.navKeyHint": { keys: string | number }
    "admin.cms.nav.subs.addGroup": { current: string | number; max: string | number }
    "admin.cms.nav.subs.groupPlaceholder": { index: string | number }
    "admin.cms.nav.subs.removeItemAria": { value: string | number }
    "admin.cms.row.disableTitle": { withNoun: "other" | "yes"; noun: string | number; label: string | number }
    "admin.cms.row.enableTitle": { withNoun: "other" | "yes"; noun: string | number; label: string | number }
    "admin.cms.tab.form.defaultHint": { count: string | number }
    "admin.coupon.ops.void.confirm": { name: string | number }
    "admin.logistics.resolve.summary": { type: string | number; detail: string | number }
    "admin.shopOps.resume.dialogDescription": { name: string | number }
    "admin.shopOps.suspend.dialogDescription": { name: string | number }
    "admin.shopReview.approve.done": { shopName: string | number }
    "admin.shopReview.approve.title": { name: string | number }
    "admin.shopReview.reject.done": { shopName: string | number }
    "admin.shopReview.reject.title": { name: string | number }
    "common.filter.all": { label: string | number }
    "common.filter.aria": { label: string | number }
}

export type AdminParamsOf<K extends AdminMessageKey> = K extends keyof AdminParamsByKey
    ? AdminParamsByKey[K]
    : undefined

/**
 * 本端调用侧的 `t` 形状：key 收在「本端 catalog ∪ app-kit 共享 catalog」，参数按各自的
 * `ParamsOf` 推。无参消息的参数位是 `undefined`，多塞一个就是编译错误。
 * 带参消息使用必需参数元组，漏传参数在编译时失败。
 * ICU 类型由 codegen 生成；运行时交给 i18next-icu。
 * 这是 §5.5 分工表里唯一那条「编译期」保证在三端兑现的地方。
 */
export type AdminTranslate = <K extends AdminMessageKey | AppKitMessageKey>(
    key: K,
    ...args: (K extends AdminMessageKey ? AdminParamsOf<K> : AppKitParamsOf<Extract<K, AppKitMessageKey>>) extends undefined
        ? [] : [params: K extends AdminMessageKey ? AdminParamsOf<K> : AppKitParamsOf<Extract<K, AppKitMessageKey>>]
) => string

/**
 * 按 namespace 收窄的 `t`：`useT("nav")` 拿它。key 位只收那一个 namespace 的 key，
 * 所以打错 key 的报错只列本 namespace 的候选，而不是整份联合。
 * 要 app-kit 的共享文案（`appKit.*` / `error.*`）就用不传 namespace 的整份 `t`。
 */
export type AdminScopedT<N extends keyof AdminNamespace> = <K extends AdminNamespace[N]>(
    key: K,
    ...args: AdminParamsOf<K> extends undefined ? [] : [params: AdminParamsOf<K>]
) => string

/** 一种语言里 AdminMessageKey 的每一个都得有一句 */
export type AdminCatalog = { [K in AdminMessageKey]: string }
