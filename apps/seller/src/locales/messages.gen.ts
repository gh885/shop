// 生成物，别手改：pnpm i18n:gen（判据与清单见 scripts/contracts/i18n-codegen.mjs、docs/conventions/i18n.md）
// 来源：apps/seller/src/locales/{en-US, zh-Hans-CN}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致、没有译文照抄源语言。这条保证属于生成期，手改这份文件不会让它成立。

import type { AppKitMessageKey, AppKitParamsOf } from "@shop/app-kit/i18n"

/** namespace `account`：3 条。收窄入口 `SellerScopedT<"account">` */
export type AccountKeys =
    "account.notLoggedIn" |
    "account.description" |
    "account.logout"

/** namespace `app`：1 条。收窄入口 `SellerScopedT<"app">` */
export type AppKeys =
    "app.title"

/** namespace `common`：10 条。收窄入口 `SellerScopedT<"common">` */
export type CommonKeys =
    "common.notFound.title" |
    "common.notFound.description" |
    "common.action.backHome" |
    "common.loadFailed.sku" |
    "common.placeholder.defaultTitle" |
    "common.placeholder.body" |
    "common.placeholder.backToProduct" |
    "common.copy.defaultLabel" |
    "common.copy.ariaLabel" |
    "common.copy.tooltip"

/** namespace `layout`：2 条。收窄入口 `SellerScopedT<"layout">` */
export type LayoutKeys =
    "layout.workbench" |
    "layout.brand"

/** namespace `login`：14 条。收窄入口 `SellerScopedT<"login">` */
export type LoginKeys =
    "login.title" |
    "login.welcome" |
    "login.headline" |
    "login.pitch" |
    "login.youAreHere" |
    "login.loginName" |
    "login.password" |
    "login.loginNameRequired" |
    "login.passwordRequired" |
    "login.signIn" |
    "login.invalidCredentials" |
    "login.failed" |
    "login.toRegister" |
    "login.toLogin"

/** namespace `member`：52 条。收窄入口 `SellerScopedT<"member">` */
export type MemberKeys =
    "common.action.cancel" |
    "common.action.save" |
    "shop.member.createFailed" |
    "shop.member.created" |
    "shop.member.form.displayName" |
    "shop.member.form.loginName" |
    "shop.member.form.loginNameHint" |
    "shop.member.form.password" |
    "shop.member.form.resetPassword" |
    "shop.member.form.resetPasswordHint" |
    "shop.member.form.resetPasswordSubmit" |
    "shop.member.form.roles" |
    "shop.member.form.shops" |
    "shop.member.grant" |
    "shop.member.noShop" |
    "shop.member.operators.add" |
    "shop.member.operators.empty" |
    "shop.member.operators.title" |
    "shop.member.page.description" |
    "shop.member.page.title" |
    "shop.member.passwordReset" |
    "shop.member.passwordResetFailed" |
    "shop.member.status.active" |
    "shop.member.status.disable" |
    "shop.member.status.disabled" |
    "shop.member.status.enable" |
    "shop.member.statusUpdateFailed" |
    "shop.member.statusUpdated" |
    "shop.member.tab.operators" |
    "shop.member.tab.roles" |
    "shop.member.updateFailed" |
    "shop.member.updated" |
    "shop.perm.FINANCE_READ" |
    "shop.perm.ORDER_READ" |
    "shop.perm.ORDER_REFUND" |
    "shop.perm.PRODUCT_READ" |
    "shop.perm.PRODUCT_WRITE" |
    "shop.perm.SHIPPING_MANAGE" |
    "shop.perm.SHOP_READ" |
    "shop.role.add" |
    "shop.role.createFailed" |
    "shop.role.created" |
    "shop.role.delete" |
    "shop.role.deleteFailed" |
    "shop.role.deleted" |
    "shop.role.empty" |
    "shop.role.form.code" |
    "shop.role.form.name" |
    "shop.role.form.permissions" |
    "shop.role.permissionCount" |
    "shop.role.title" |
    "shop.member.primaryOnly"

/** namespace `nav`：39 条。收窄入口 `SellerScopedT<"nav">` */
export type NavKeys =
    "nav.home" |
    "nav.trade" |
    "nav.trade.section.0" |
    "nav.trade.section.1" |
    "nav.trade.order" |
    "nav.trade.shipping" |
    "nav.trade.ship" |
    "nav.trade.logistics" |
    "nav.trade.refund" |
    "nav.trade.buyershow" |
    "nav.product" |
    "nav.product.section.0" |
    "nav.product.section.1" |
    "nav.product.list" |
    "nav.product.create" |
    "nav.product.category" |
    "nav.product.stock" |
    "nav.product.supplier" |
    "nav.product.purchase" |
    "nav.product.price" |
    "nav.shop" |
    "nav.shop.section.0" |
    "nav.shop.section.1" |
    "nav.shop.decoration" |
    "nav.shop.notice" |
    "nav.shop.license" |
    "nav.shop.brand" |
    "nav.marketing" |
    "nav.marketing.section.0" |
    "nav.marketing.campaign" |
    "nav.marketing.flash" |
    "nav.service" |
    "nav.data" |
    "nav.data.section.0" |
    "nav.data.overview" |
    "nav.data.report" |
    "nav.data.visit" |
    "nav.shop.member" |
    "nav.shop.settings"

/** namespace `order`：84 条。收窄入口 `SellerScopedT<"order">` */
export type OrderKeys =
    "order.toast.shipped" |
    "order.toast.shipFailed" |
    "order.toast.agreeAfterSale" |
    "order.toast.rejectAfterSale" |
    "order.toast.refundConfirmed" |
    "order.toast.buyerPhone.failed" |
    "order.action.agree" |
    "order.action.reject" |
    "order.action.receive" |
    "order.list.header.orderNo" |
    "order.list.header.payAmount" |
    "order.list.header.status" |
    "order.list.header.createdAt" |
    "order.list.header.action" |
    "order.list.action.ship" |
    "order.empty.title" |
    "order.empty.description" |
    "order.ship.title" |
    "order.ship.orderNoLabel" |
    "order.ship.carrier.label" |
    "order.ship.carrier.placeholder" |
    "order.ship.tracking.label" |
    "order.ship.tracking.placeholder" |
    "order.ship.submit" |
    "order.refund.header.ticket" |
    "order.refund.header.orderNo" |
    "order.refund.header.refundAmount" |
    "order.refund.header.reason" |
    "order.refund.header.appliedAt" |
    "order.refund.header.action" |
    "order.refund.handled" |
    "order.refund.empty.title" |
    "order.refund.empty.description" |
    "order.decision.title.agree" |
    "order.decision.title.reject" |
    "order.decision.title.receive" |
    "order.decision.desc.receive" |
    "order.decision.desc.agreeReturnRefund" |
    "order.decision.desc.agreeRefundOnly" |
    "order.decision.row.orderNo" |
    "order.decision.row.type" |
    "order.decision.row.refundAmount" |
    "order.decision.row.reason" |
    "order.decision.loading" |
    "order.decision.loadFailed" |
    "order.decision.notFound" |
    "order.decision.reason.label" |
    "order.decision.reason.placeholder" |
    "order.decision.reason.submit" |
    "order.decision.confirmAgree" |
    "order.decision.confirmReceive" |
    "order.ship.lines.label" |
    "order.ship.lines.remaining" |
    "order.ship.lines.quantityOf" |
    "order.ship.lines.empty" |
    "order.status.pending_payment" |
    "order.status.awaiting_shipment" |
    "order.status.partially_shipped" |
    "order.status.shipped" |
    "order.status.received" |
    "order.status.closed" |
    "order.rmaType.refund_only" |
    "order.rmaType.return_refund" |
    "order.rmaType.exchange" |
    "order.rmaStatus.applied" |
    "order.rmaStatus.approved" |
    "order.rmaStatus.rejected" |
    "order.rmaStatus.cancelled" |
    "order.rmaStatus.shipping_back" |
    "order.rmaStatus.received" |
    "order.rmaStatus.refunding" |
    "order.rmaStatus.reshipping" |
    "order.rmaStatus.completed" |
    "order.rmaStatus.disputed" |
    "order.action.refund" |
    "order.decision.desc.reject" |
    "order.decision.row.caseNo" |
    "order.list.loadMore" |
    "order.list.action.revealPhone" |
    "order.tab.all" |
    "order.decision.title.refund" |
    "order.decision.confirmRefund" |
    "order.decision.desc.refund" |
    "order.reason.none"

/** namespace `product`：153 条。收窄入口 `SellerScopedT<"product">` */
export type ProductKeys =
    "product.err.priceFormat" |
    "product.err.countFormat" |
    "product.toast.skuOkPrice" |
    "product.toast.skuOkStock" |
    "product.toast.saveFailed" |
    "product.toast.titleUpdated" |
    "product.toast.offShelf" |
    "product.toast.offShelfFailed" |
    "product.toast.onShelf" |
    "product.toast.onShelfFailed" |
    "product.skuEdit.price.title" |
    "product.skuEdit.price.notice" |
    "product.skuEdit.stock.title" |
    "product.skuEdit.stock.notice" |
    "product.list.title" |
    "product.list.action.create" |
    "product.list.header.price" |
    "product.list.header.stock" |
    "product.list.header.createdAt" |
    "product.list.header.action" |
    "product.list.action.offShelf" |
    "product.list.confirm.offShelf.title" |
    "product.list.confirm.offShelf.body" |
    "product.list.empty.filtered.title" |
    "product.list.empty.filtered.body" |
    "product.list.empty.initial.title" |
    "product.list.empty.initial.body" |
    "product.filter.title.label" |
    "product.filter.title.placeholder" |
    "product.sku.singleSpec" |
    "product.sku.unit.yuan" |
    "product.editSku.productLabel" |
    "product.editSku.col.sku" |
    "product.editSku.col.price" |
    "product.editSku.price.aria" |
    "product.editSku.stock.aria" |
    "product.editSku.submit" |
    "product.editTitle.title" |
    "product.editTitle.name.label" |
    "product.editTitle.name.placeholder" |
    "product.editTitle.submit" |
    "product.status.draft" |
    "product.status.pending" |
    "product.status.approved" |
    "product.status.rejected" |
    "product.status.online" |
    "product.status.offline" |
    "product.list.loadMore" |
    "product.list.action.relist" |
    "product.list.header.skuCount" |
    "product.editSku.col.weight" |
    "product.sku.unit.gram" |
    "product.list.header.product" |
    "product.list.header.status" |
    "product.list.confirm.offShelf.confirm" |
    "product.list.action.editTitle" |
    "product.list.action.editSku" |
    "product.create.title" |
    "product.create.subtitle" |
    "product.create.loadFailed" |
    "product.create.uploadFailed" |
    "product.create.category.label" |
    "product.create.category.switch" |
    "product.create.section.basic" |
    "product.create.section.attributes" |
    "product.create.section.specs" |
    "product.create.section.specImages" |
    "product.create.section.skus" |
    "product.create.title.label" |
    "product.create.title.placeholder" |
    "product.create.title.hint" |
    "product.create.subtitle.label" |
    "product.create.subtitle.placeholder" |
    "product.create.subtitle.hint" |
    "product.create.brand.label" |
    "product.create.brand.placeholder" |
    "product.create.brand.none" |
    "product.create.modelNo.label" |
    "product.create.modelNo.placeholder" |
    "product.create.modelNo.hint" |
    "product.create.images.label" |
    "product.create.images.uploadLabel" |
    "product.create.images.coverLabel" |
    "product.create.images.hint" |
    "product.create.sevenDay.label" |
    "product.create.sevenDay.checkbox" |
    "product.create.sevenDay.hint" |
    "product.create.detailImages.label" |
    "product.create.detailImages.uploadLabel" |
    "product.create.detailImages.hint" |
    "product.create.attr.removeValue" |
    "product.create.attr.customPlaceholder" |
    "product.create.attr.addValue" |
    "product.create.attr.placeholder" |
    "product.create.attr.numberPlaceholder" |
    "product.create.specs.none" |
    "product.create.specs.hint" |
    "product.create.specs.dimensionHint" |
    "product.create.specs.valuePlaceholder" |
    "product.create.specs.addValue" |
    "product.create.specImages.hint" |
    "product.create.specImages.uploadLabel" |
    "product.create.skus.hint" |
    "product.create.skus.batchLabel" |
    "product.create.skus.batchPriceAria" |
    "product.create.skus.batchOriginalPriceAria" |
    "product.create.skus.batchWeightAria" |
    "product.create.skus.batchApply" |
    "product.create.sku.spec" |
    "product.create.sku.price" |
    "product.create.sku.originalPrice" |
    "product.create.sku.weight" |
    "product.create.sku.barcode" |
    "product.create.sku.merchantCode" |
    "product.create.sku.priceAria" |
    "product.create.sku.originalPriceAria" |
    "product.create.sku.weightAria" |
    "product.create.sku.barcodeAria" |
    "product.create.sku.merchantCodeAria" |
    "product.create.sku.onSale" |
    "product.create.sku.onSaleAria" |
    "product.create.action.saveDraft" |
    "product.create.action.submit" |
    "product.create.toast.draftSaved" |
    "product.create.toast.submitted" |
    "product.create.error.titleRequired" |
    "product.create.error.imagesRequired" |
    "product.create.error.attrRequired" |
    "product.create.error.attrValueInvalid" |
    "product.create.error.specRequired" |
    "product.create.error.skuRequired" |
    "product.create.error.priceRequired" |
    "product.create.error.priceFormat" |
    "product.create.error.skuLimit" |
    "product.create.error.forbiddenWord" |
    "product.create.error.forbiddenWordGlobal" |
    "product.category.search.placeholder" |
    "product.category.search.submit" |
    "product.category.search.selectCategory" |
    "product.category.confirm.label" |
    "product.category.confirm.emptyHint" |
    "product.category.confirm.next" |
    "product.category.col.reachedLeaf" |
    "product.category.col.needParent" |
    "product.category.col.filterPlaceholder" |
    "product.category.col.filterAria" |
    "product.category.col.noMatch" |
    "product.category.result.emptyTitle" |
    "product.category.result.emptyBody" |
    "product.category.result.count" |
    "product.create.draft.found" |
    "product.create.draft.restore" |
    "product.create.draft.discard"

/** namespace `register`：13 条。收窄入口 `SellerScopedT<"register">` */
export type RegisterKeys =
    "register.title" |
    "register.description" |
    "register.shopName" |
    "register.shopNameRequired" |
    "register.loginName" |
    "register.loginNameRequired" |
    "register.loginNameInvalid" |
    "register.password" |
    "register.passwordRequired" |
    "register.passwordWeak" |
    "register.loginNameTaken" |
    "register.submit" |
    "register.failed"

/** namespace `shipping`：40 条。收窄入口 `SellerScopedT<"shipping">` */
export type ShippingKeys =
    "shipping.region.title" |
    "shipping.region.hint" |
    "shipping.region.add" |
    "shipping.region.itemTitle" |
    "shipping.region.removeAria" |
    "shipping.region.coverage" |
    "shipping.freeShipping.amountLabel" |
    "shipping.freeShipping.thresholdPlaceholder" |
    "shipping.tier.firstQuantity" |
    "shipping.tier.firstFee" |
    "shipping.tier.addQuantity" |
    "shipping.tier.addFee" |
    "shipping.regionPicker.placeholder" |
    "shipping.regionPicker.searchPlaceholder" |
    "shipping.regionPicker.selectedCount" |
    "shipping.empty.title" |
    "shipping.saveNotice" |
    "shipping.save.new" |
    "shipping.save.edit" |
    "shipping.err.firstQuantityInt" |
    "shipping.err.firstFeeFormat" |
    "shipping.err.addQuantityInt" |
    "shipping.err.addFeeFormat" |
    "shipping.err.freeOverAmountFormat" |
    "shipping.err.regionMissing" |
    "shipping.err.duplicateRegion" |
    "shipping.toast.saved" |
    "shipping.basic.title" |
    "shipping.basic.hint" |
    "shipping.basic.name" |
    "shipping.basic.chargeBy" |
    "shipping.chargeBy.piece" |
    "shipping.chargeBy.weight" |
    "shipping.region.defaultTitle" |
    "shipping.region.defaultBadge" |
    "shipping.activeNotice" |
    "shipping.draftNotice" |
    "shipping.activate" |
    "shipping.toast.activated" |
    "shipping.err.nameRequired"

/** namespace `shop`：17 条。收窄入口 `SellerScopedT<"shop">` */
export type ShopKeys =
    "shop.onboarding.pending" |
    "shop.onboarding.rejected" |
    "shop.onboarding.resubmit" |
    "shop.onboarding.resubmitFailed" |
    "shop.settings.title" |
    "shop.settings.description" |
    "shop.settings.name" |
    "shop.settings.nameRequired" |
    "shop.settings.rename" |
    "shop.settings.renameDone" |
    "shop.settings.renameFailed" |
    "shop.settings.close" |
    "shop.settings.closeTitle" |
    "shop.settings.closeBody" |
    "shop.settings.closeDone" |
    "shop.settings.closeFailed" |
    "shop.settings.closeReason"

/** namespace `topbar`：4 条。收窄入口 `SellerScopedT<"topbar">` */
export type TopbarKeys =
    "topbar.messages" |
    "topbar.rules" |
    "topbar.help" |
    "topbar.support"

/**
 * namespace 名 → 该 namespace 的 key 类型。「有哪些 namespace 可选」的唯一真相，
 *  也是收窄形态 `SellerScopedT` 的入口。
 */
export type SellerNamespace = {
    "account": AccountKeys
    "app": AppKeys
    "common": CommonKeys
    "layout": LayoutKeys
    "login": LoginKeys
    "member": MemberKeys
    "nav": NavKeys
    "order": OrderKeys
    "product": ProductKeys
    "register": RegisterKeys
    "shipping": ShippingKeys
    "shop": ShopKeys
    "topbar": TopbarKeys
}

/** 本 root 全部 key 的联合（各 `{Ns}Keys` 的并集）。铺到几千条后打字面量会很难受，
 *  所以按 namespace 收窄的入口是 `SellerScopedT`——见 按资源文件收窄 key 的约定。 */
export type SellerMessageKey = SellerNamespace[keyof SellerNamespace]

export type SellerParamsByKey = {
    "common.copy.ariaLabel": { label: string | number; value: string | number }
    "common.copy.tooltip": { label: string | number }
    "order.ship.lines.quantityOf": { name: string | number }
    "order.ship.lines.remaining": { quantity: string | number }
    "product.category.result.count": { count: string | number }
    "product.category.result.emptyTitle": { keyword: string | number }
    "product.create.attr.removeValue": { value: string | number }
    "product.create.error.forbiddenWord": { word: string | number }
    "product.create.sku.barcodeAria": { label: string | number }
    "product.create.sku.merchantCodeAria": { label: string | number }
    "product.create.sku.onSaleAria": { label: string | number }
    "product.create.sku.originalPriceAria": { label: string | number }
    "product.create.sku.priceAria": { label: string | number }
    "product.create.sku.weightAria": { label: string | number }
    "product.editSku.price.aria": { label: string | number }
    "product.editSku.stock.aria": { label: string | number }
    "product.list.confirm.offShelf.body": { name: string | number }
    "shipping.err.duplicateRegion": { prefix: string | number }
    "shipping.err.regionMissing": { index: string | number }
    "shipping.region.itemTitle": { index: string | number }
    "shipping.regionPicker.selectedCount": { count: string | number }
    "shop.role.permissionCount": { count: string | number }
}

export type SellerParamsOf<K extends SellerMessageKey> = K extends keyof SellerParamsByKey
    ? SellerParamsByKey[K]
    : undefined

/**
 * 本端调用侧的 `t` 形状：key 收在「本端 catalog ∪ app-kit 共享 catalog」，参数按各自的
 * `ParamsOf` 推。无参消息的参数位是 `undefined`，多塞一个就是编译错误。
 * 带参消息使用必需参数元组，漏传参数在编译时失败。
 * ICU 类型由 codegen 生成；运行时交给 i18next-icu。
 * 这是 类型与资源生成规则 分工表里唯一那条「编译期」保证在三端兑现的地方。
 */
export type SellerTranslate = <K extends SellerMessageKey | AppKitMessageKey>(
    key: K,
    ...args: (K extends SellerMessageKey ? SellerParamsOf<K> : AppKitParamsOf<Extract<K, AppKitMessageKey>>) extends undefined
        ? [] : [params: K extends SellerMessageKey ? SellerParamsOf<K> : AppKitParamsOf<Extract<K, AppKitMessageKey>>]
) => string

/**
 * 按 namespace 收窄的 `t`：`useT("nav")` 拿它。key 位只收那一个 namespace 的 key，
 * 所以打错 key 的报错只列本 namespace 的候选，而不是整份联合。
 * 要 app-kit 的共享文案（`login.*` / `error.*`）就用不传 namespace 的整份 `t`。
 */
export type SellerScopedT<N extends keyof SellerNamespace> = <K extends SellerNamespace[N]>(
    key: K,
    ...args: SellerParamsOf<K> extends undefined ? [] : [params: SellerParamsOf<K>]
) => string

/** 一种语言里 SellerMessageKey 的每一个都得有一句 */
export type SellerCatalog = { [K in SellerMessageKey]: string }
