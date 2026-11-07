// 生成物，别手改：pnpm i18n:gen（判据与清单见 scripts/contracts/i18n-codegen.mjs、docs/conventions/i18n.md）
// 来源：apps/admin/src/locales/{en-US, zh-Hans-CN}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致、没有译文照抄源语言。这条保证属于生成期，手改这份文件不会让它成立。

import type { SharedMessageKey, SharedParamsOf } from "@shop/i18n"

/** namespace `account`：54 条。收窄入口 `AdminScopedT<"account">` */
export type AccountKeys =
    "account.description" |
    "account.logout" |
    "account.status.ACTIVE" |
    "account.status.DISABLED" |
    "account.form.err.employeeNoRequired" |
    "account.form.err.employeeNoPattern" |
    "account.staff.created" |
    "account.staff.failed" |
    "account.statusUpdate.done" |
    "account.statusUpdate.failed" |
    "account.col.phone" |
    "account.col.nickname" |
    "account.col.loginName" |
    "account.col.displayName" |
    "account.col.role" |
    "account.col.status" |
    "account.col.registeredAt" |
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
    "account.role.action" |
    "account.role.dialogTitle" |
    "account.role.targetLabel" |
    "account.role.summary" |
    "account.role.summaryNamed" |
    "account.role.submitting" |
    "account.role.submit" |
    "account.role.updated" |
    "account.role.failed" |
    "account.role.selfLocked" |
    "account.role.none" |
    "account.statusAction.enable" |
    "account.statusAction.disable" |
    "account.statusAction.enableTitle" |
    "account.statusAction.disableTitle" |
    "account.statusAction.enableConfirm" |
    "account.statusAction.disableConfirm" |
    "account.staff.create" |
    "account.staff.dialogTitle" |
    "account.staff.displayName" |
    "account.staff.displayNamePlaceholder" |
    "account.staff.password" |
    "account.staff.passwordPlaceholder" |
    "account.staff.role" |
    "account.staff.submit" |
    "account.staff.loginName" |
    "account.staff.loginNamePlaceholder"

/** namespace `app`：1 条。收窄入口 `AdminScopedT<"app">` */
export type AppKeys =
    "app.title"

/** namespace `category`：115 条。收窄入口 `AdminScopedT<"category">` */
export type CategoryKeys =
    "category.title" |
    "category.description" |
    "category.empty.title" |
    "category.empty.description" |
    "category.action.enable" |
    "category.action.disable" |
    "category.form.submitSave" |
    "category.created" |
    "category.failed" |
    "category.updated" |
    "category.updateFailed" |
    "category.statusUpdated" |
    "category.statusUpdateFailed" |
    "category.orderUpdated" |
    "category.orderUpdateFailed" |
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
    "category.form.code.label" |
    "category.form.code.placeholder" |
    "category.form.err.categoryCodeRequired" |
    "category.action.edit" |
    "category.action.collapse" |
    "category.attr.add" |
    "category.attr.added" |
    "category.attr.addFailed" |
    "category.attr.updated" |
    "category.attr.updateFailed" |
    "category.attr.visibleWhen" |
    "category.value.added" |
    "category.value.addFailed" |
    "category.value.updated" |
    "category.value.updateFailed" |
    "category.values.title" |
    "category.values.add" |
    "category.values.empty" |
    "category.values.hasImage" |
    "category.flag.salesSpec" |
    "category.flag.required" |
    "category.flag.identity" |
    "category.flag.filterable" |
    "category.flag.multi" |
    "category.flag.allowCustom" |
    "category.flag.allowCustomHint" |
    "category.form.attrCode.label" |
    "category.form.attrCode.placeholder" |
    "category.form.attrName.label" |
    "category.form.valueType.label" |
    "category.form.unit.label" |
    "category.form.unit.placeholder" |
    "category.form.options.label" |
    "category.form.options.hint" |
    "category.form.sort.label" |
    "category.form.value.label" |
    "category.form.imageUrl.label" |
    "category.form.status.label" |
    "category.form.err.optionsRequired" |
    "category.form.err.unitRequired" |
    "category.form.err.identityType" |
    "category.rules.required" |
    "category.rules.filterable" |
    "category.rules.multi" |
    "category.rules.allowCustom" |
    "category.rules.identity" |
    "category.rules.salesSpec" |
    "category.rules.none" |
    "category.config.title" |
    "category.config.description" |
    "category.config.identityKeys" |
    "category.config.skuIdentityKinds" |
    "category.config.matchStrategies" |
    "category.config.brandPolicy" |
    "category.config.qualificationCodes" |
    "category.config.qualificationPlaceholder" |
    "category.config.autoApprove" |
    "category.config.autoApproveHint" |
    "category.config.key.model_no" |
    "category.config.key.article_no" |
    "category.config.key.param_hash" |
    "category.config.key.none" |
    "category.config.key.gtin" |
    "category.config.policy.required" |
    "category.config.policy.optional" |
    "category.config.policy.forbidden" |
    "category.config.err.identityKeysRequired" |
    "category.config.err.skuKindsRequired" |
    "category.config.err.noneExclusive" |
    "category.config.err.strategySubset" |
    "category.config.updated" |
    "category.config.updateFailed" |
    "category.form.err.sortInt"

/** namespace `common`：11 条。收窄入口 `AdminScopedT<"common">` */
export type CommonKeys =
    "common.notFound.title" |
    "common.notFound.description" |
    "common.action.backHome" |
    "common.action.cancel" |
    "common.col.actions" |
    "common.filter.all" |
    "common.filter.aria" |
    "common.filter.status" |
    "common.loading" |
    "common.loadFailed.categoryTree" |
    "common.loadMore"

/** namespace `governance`：25 条。收窄入口 `AdminScopedT<"governance">` */
export type GovernanceKeys =
    "governance.title" |
    "governance.description" |
    "governance.filter.all" |
    "governance.status.applied" |
    "governance.status.active" |
    "governance.status.rejected" |
    "governance.status.suspended" |
    "governance.status.closing" |
    "governance.status.closed" |
    "governance.queue.empty" |
    "governance.col.merchant" |
    "governance.col.status" |
    "governance.col.level" |
    "governance.col.updatedAt" |
    "governance.approve.action" |
    "governance.approve.title" |
    "governance.approve.confirm" |
    "governance.approve.done" |
    "governance.approve.failed" |
    "governance.reject.action" |
    "governance.reject.title" |
    "governance.reject.placeholder" |
    "governance.reject.cancel" |
    "governance.reject.done" |
    "governance.reject.failed"

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

/** namespace `logistics`：61 条。收窄入口 `AdminScopedT<"logistics">` */
export type LogisticsKeys =
    "logistics.carrier.deppon" |
    "logistics.carrier.ems" |
    "logistics.carrier.jd" |
    "logistics.carrier.jt" |
    "logistics.carrier.sf" |
    "logistics.carrier.sto" |
    "logistics.carrier.yto" |
    "logistics.carrier.yunda" |
    "logistics.carrier.zto" |
    "logistics.code.COLLECTED" |
    "logistics.code.DELIVERED" |
    "logistics.code.EXCEPTION" |
    "logistics.code.IN_TRANSIT" |
    "logistics.code.OUT_FOR_DELIVERY" |
    "logistics.code.REJECTED" |
    "logistics.code.RETURNED" |
    "logistics.code.UNKNOWN" |
    "logistics.codeMap.add" |
    "logistics.codeMap.cancel" |
    "logistics.codeMap.delete" |
    "logistics.codeMap.deleteConfirm" |
    "logistics.codeMap.deleteFailed" |
    "logistics.codeMap.deleteTitle" |
    "logistics.codeMap.deleted" |
    "logistics.codeMap.description" |
    "logistics.codeMap.empty" |
    "logistics.codeMap.save" |
    "logistics.codeMap.saveFailed" |
    "logistics.codeMap.saved" |
    "logistics.codeMap.title" |
    "logistics.form.carrier" |
    "logistics.form.mapNote" |
    "logistics.form.mapNoteHint" |
    "logistics.form.note" |
    "logistics.form.noteHint" |
    "logistics.form.occurredAt" |
    "logistics.form.occurredAtHint" |
    "logistics.form.rawCode" |
    "logistics.form.rawCodeHint" |
    "logistics.form.signedBy" |
    "logistics.form.signedByHint" |
    "logistics.form.standardCode" |
    "logistics.form.trackingNo" |
    "logistics.lookup.description" |
    "logistics.lookup.empty" |
    "logistics.lookup.rawCode" |
    "logistics.lookup.submit" |
    "logistics.lookup.title" |
    "logistics.page.description" |
    "logistics.page.title" |
    "logistics.record.description" |
    "logistics.record.done" |
    "logistics.record.err.note" |
    "logistics.record.err.trackingNo" |
    "logistics.record.failed" |
    "logistics.record.submit" |
    "logistics.record.title" |
    "logistics.unmapped.description" |
    "logistics.unmapped.occurrences" |
    "logistics.unmapped.title" |
    "logistics.codeMap.err.rawCode"

/** namespace `nav`：10 条。收窄入口 `AdminScopedT<"nav">` */
export type NavKeys =
    "nav.account" |
    "nav.account.section.0" |
    "nav.product" |
    "nav.product.section.0" |
    "nav.logistics" |
    "nav.logistics.section.0" |
    "nav.governance" |
    "nav.governance.section.0" |
    "nav.payments" |
    "nav.payments.section.0"

/** namespace `page`：6 条。收窄入口 `AdminScopedT<"page">` */
export type PageKeys =
    "page.accounts.users" |
    "page.accounts.staff" |
    "page.categories" |
    "page.logistics" |
    "page.governance.review" |
    "page.payments.suspense"

/** namespace `payment`：28 条。收窄入口 `AdminScopedT<"payment">` */
export type PaymentKeys =
    "payment.title" |
    "payment.description" |
    "payment.filter.all" |
    "payment.status.open" |
    "payment.status.resolved" |
    "payment.resolution.refunded" |
    "payment.resolution.dismissed" |
    "payment.reason.LATE_CALLBACK" |
    "payment.reason.AMOUNT_MISMATCH" |
    "payment.reason.ORDER_CLOSED" |
    "payment.col.createdAt" |
    "payment.col.reason" |
    "payment.col.amount" |
    "payment.col.channel" |
    "payment.col.txn" |
    "payment.col.status" |
    "payment.empty" |
    "payment.refund.action" |
    "payment.refund.title" |
    "payment.refund.confirm" |
    "payment.refund.done" |
    "payment.refund.failed" |
    "payment.dismiss.action" |
    "payment.dismiss.title" |
    "payment.dismiss.placeholder" |
    "payment.dismiss.cancel" |
    "payment.dismiss.done" |
    "payment.dismiss.failed"

/**
 * namespace 名 → 该 namespace 的 key 类型。「有哪些 namespace 可选」的唯一真相，
 *  也是收窄形态 `AdminScopedT` 的入口。
 */
export type AdminNamespace = {
    "account": AccountKeys
    "app": AppKeys
    "category": CategoryKeys
    "common": CommonKeys
    "governance": GovernanceKeys
    "layout": LayoutKeys
    "login": LoginKeys
    "logistics": LogisticsKeys
    "nav": NavKeys
    "page": PageKeys
    "payment": PaymentKeys
}

/** 本 root 全部 key 的联合（各 `{Ns}Keys` 的并集）。铺到几千条后打字面量会很难受，
 *  所以按 namespace 收窄的入口是 `AdminScopedT`——见 按资源文件收窄 key 的约定。 */
export type AdminMessageKey = AdminNamespace[keyof AdminNamespace]

export type AdminParamsByKey = {
    "account.role.summary": { loginName: string | number; from: string | number; to: string | number }
    "account.role.summaryNamed": { loginName: string | number; name: string | number; from: string | number; to: string | number }
    "account.statusAction.disableConfirm": { target: string | number }
    "account.statusAction.enableConfirm": { target: string | number }
    "category.attr.visibleWhen": { attribute: string | number; values: string | number }
    "category.confirm.disable.title": { name: string | number }
    "category.levelBadge": { level: string | number }
    "common.filter.all": { label: string | number }
    "common.filter.aria": { label: string | number }
    "governance.approve.confirm": { target: string | number }
    "logistics.codeMap.deleteConfirm": { carrier: string | number; rawCode: string | number }
    "logistics.unmapped.occurrences": { count: string | number }
    "payment.refund.confirm": { amount: string | number }
}

export type AdminParamsOf<K extends AdminMessageKey> = K extends keyof AdminParamsByKey
    ? AdminParamsByKey[K]
    : undefined

/**
 * 本端调用侧的 `t` 形状：key 收在「本端 catalog ∪ 共享 catalog」，参数按各自的
 * `ParamsOf` 推。无参消息的参数位是 `undefined`，多塞一个就是编译错误。
 * 带参消息使用必需参数元组，漏传参数在编译时失败。
 * ICU 类型由 codegen 生成；运行时交给 i18next-icu。
 * 这是 类型与资源生成规则 分工表里唯一那条「编译期」保证在三端兑现的地方。
 */
export type AdminTranslate = <K extends AdminMessageKey | SharedMessageKey>(
    key: K,
    ...args: (K extends AdminMessageKey ? AdminParamsOf<K> : SharedParamsOf<Extract<K, SharedMessageKey>>) extends undefined
        ? [] : [params: K extends AdminMessageKey ? AdminParamsOf<K> : SharedParamsOf<Extract<K, SharedMessageKey>>]
) => string

/**
 * 按 namespace 收窄的 `t`：`useT("nav")` 拿它。key 位只收那一个 namespace 的 key，
 * 所以打错 key 的报错只列本 namespace 的候选，而不是整份联合。
 * 要 i18n 包的共享文案（`login.*` / `error.*`）就用不传 namespace 的整份 `t`。
 */
export type AdminScopedT<N extends keyof AdminNamespace> = <K extends AdminNamespace[N]>(
    key: K,
    ...args: AdminParamsOf<K> extends undefined ? [] : [params: AdminParamsOf<K>]
) => string

/** 一种语言里 AdminMessageKey 的每一个都得有一句 */
export type AdminCatalog = { [K in AdminMessageKey]: string }
