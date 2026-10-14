// 生成物，别手改：pnpm i18n:gen（判据与清单见 scripts/contracts/i18n-codegen.mjs、docs/conventions/i18n.md）
// 来源：apps/seller/src/locales/{en-US, zh-Hans-CN}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致。这条保证属于生成期，手改这份文件不会让它成立。

import type { AppKitMessageKey, AppKitParamsOf } from "@shop/app-kit/i18n"

/** namespace `account`：3 条。收窄入口 `SellerScopedT<"account">` */
export type AccountKeys =
    "account.notLoggedIn" |
    "account.description" |
    "account.logout"

/** namespace `app`：1 条。收窄入口 `SellerScopedT<"app">` */
export type AppKeys =
    "app.title"

/** namespace `common`：19 条。收窄入口 `SellerScopedT<"common">` */
export type CommonKeys =
    "common.notFound.title" |
    "common.notFound.description" |
    "common.action.backHome" |
    "common.unpriced" |
    "common.loadFailed.carriers" |
    "common.loadFailed.specTemplate" |
    "common.loadFailed.sku" |
    "common.loadFailed.categoryTree" |
    "common.upload.ticketFailed" |
    "common.upload.ticketInvalid" |
    "common.upload.directFailed" |
    "common.action.save" |
    "common.placeholder.defaultTitle" |
    "common.placeholder.body" |
    "common.placeholder.backToProduct" |
    "common.copy.defaultLabel" |
    "common.copy.ariaLabel" |
    "common.copy.tooltip" |
    "common.tableCard.total"

/** namespace `coupon`：75 条。收窄入口 `SellerScopedT<"coupon">` */
export type CouponKeys =
    "coupon.rule.reduction.threshold" |
    "coupon.rule.reduction.noThreshold" |
    "coupon.rule.rate.threshold" |
    "coupon.rule.rate.thresholdCapped" |
    "coupon.rule.rate.noThreshold" |
    "coupon.rule.rate.noThresholdCapped" |
    "coupon.form.title" |
    "coupon.form.intro" |
    "coupon.form.name.label" |
    "coupon.form.name.placeholder" |
    "coupon.form.type.label" |
    "coupon.type.FULL_REDUCTION" |
    "coupon.type.DISCOUNT" |
    "coupon.form.threshold.label" |
    "coupon.form.threshold.placeholder" |
    "coupon.form.rate.label" |
    "coupon.form.rate.placeholder" |
    "coupon.form.discount.label" |
    "coupon.form.discount.placeholder" |
    "coupon.form.maxDiscount.label" |
    "coupon.form.maxDiscount.placeholder" |
    "coupon.form.maxDiscount.hint" |
    "coupon.form.total.label" |
    "coupon.form.total.placeholder" |
    "coupon.form.windowFrom.label" |
    "coupon.form.windowFrom.hint" |
    "coupon.form.windowTo.label" |
    "coupon.form.windowTo.hint" |
    "coupon.form.validDays.label" |
    "coupon.form.validDays.placeholder" |
    "coupon.form.validDays.hint" |
    "coupon.form.submit" |
    "coupon.form.err.nameRequired" |
    "coupon.form.err.nameMax" |
    "coupon.form.err.thresholdRequired" |
    "coupon.form.err.thresholdFormat" |
    "coupon.form.err.totalRequired" |
    "coupon.form.err.totalInt" |
    "coupon.form.err.totalMax" |
    "coupon.form.err.windowFromRequired" |
    "coupon.form.err.windowToRequired" |
    "coupon.form.err.rateRange" |
    "coupon.form.err.maxDiscountRequired" |
    "coupon.form.err.maxDiscountFormat" |
    "coupon.form.err.discountRequired" |
    "coupon.form.err.discountPositive" |
    "coupon.form.err.discountOverThreshold" |
    "coupon.form.err.validDaysRange" |
    "coupon.form.err.windowOrder" |
    "coupon.toast.created" |
    "coupon.toast.disabled" |
    "coupon.status.NOT_STARTED" |
    "coupon.status.ONGOING" |
    "coupon.status.ENDED" |
    "coupon.status.STOPPED" |
    "coupon.page.intro" |
    "coupon.page.create" |
    "coupon.page.noEditNotice" |
    "coupon.page.empty.title" |
    "coupon.page.empty.description" |
    "coupon.list.pagination.unit" |
    "coupon.list.header.name" |
    "coupon.list.header.rule" |
    "coupon.list.header.period" |
    "coupon.list.header.issueStatus" |
    "coupon.list.header.status" |
    "coupon.list.header.createdAt" |
    "coupon.list.header.action" |
    "coupon.list.issued" |
    "coupon.list.used" |
    "coupon.list.progress.aria" |
    "coupon.list.confirm.stop.title" |
    "coupon.list.confirm.stop.desc" |
    "coupon.list.confirm.stop.confirm" |
    "coupon.action.stop"

/** namespace `layout`：2 条。收窄入口 `SellerScopedT<"layout">` */
export type LayoutKeys =
    "layout.workbench" |
    "layout.brand"

/** namespace `login`：17 条。收窄入口 `SellerScopedT<"login">` */
export type LoginKeys =
    "login.title" |
    "login.welcome" |
    "login.headline" |
    "login.pitch" |
    "login.youAreHere" |
    "login.entry.owner" |
    "login.entry.subaccount" |
    "login.subaccount.loginName" |
    "login.subaccount.loginNamePlaceholder" |
    "login.subaccount.loginNameRule" |
    "login.subaccount.phone" |
    "login.subaccount.phonePlaceholder" |
    "login.subaccount.submit" |
    "login.subaccount.activate.title" |
    "login.subaccount.activate.desc" |
    "login.subaccount.activate.submit" |
    "login.subaccount.activate.back"

/** namespace `nav`：42 条。收窄入口 `SellerScopedT<"nav">` */
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
    "nav.trade.review" |
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
    "nav.shop.list" |
    "nav.shop.address" |
    "nav.shop.member" |
    "nav.shop.decoration" |
    "nav.shop.notice" |
    "nav.shop.license" |
    "nav.shop.brand" |
    "nav.marketing" |
    "nav.marketing.section.0" |
    "nav.marketing.campaign" |
    "nav.marketing.coupon" |
    "nav.marketing.flash" |
    "nav.service" |
    "nav.data" |
    "nav.data.section.0" |
    "nav.data.overview" |
    "nav.data.report" |
    "nav.data.visit"

/** namespace `order`：100 条。收窄入口 `SellerScopedT<"order">` */
export type OrderKeys =
    "order.tab.all" |
    "order.status.PENDING_PAYMENT" |
    "order.status.PAID" |
    "order.status.SHIPPED" |
    "order.status.COMPLETED" |
    "order.status.CANCELLED" |
    "order.afterSale.APPLYING" |
    "order.afterSale.RETURNING" |
    "order.afterSale.REFUNDED" |
    "order.afterSale.REJECTED" |
    "order.afterSale.CLOSED" |
    "order.ticketType.REFUND_ONLY" |
    "order.ticketType.RETURN_REFUND" |
    "order.ticketStatus.APPLYING" |
    "order.ticketStatus.RETURNING" |
    "order.ticketStatus.REFUNDED" |
    "order.ticketStatus.REJECTED" |
    "order.ticketStatus.CLOSED" |
    "order.reason.NO_REASON" |
    "order.reason.QUALITY_ISSUE" |
    "order.reason.NOT_AS_DESCRIBED" |
    "order.reason.DAMAGED" |
    "order.reason.WRONG_ITEM" |
    "order.reason.MISSING_ITEM" |
    "order.reason.OTHER" |
    "order.reason.none" |
    "order.toast.shipped" |
    "order.toast.shipFailed" |
    "order.toast.agreeAfterSale" |
    "order.toast.rejectAfterSale" |
    "order.toast.refundConfirmed" |
    "order.toast.buyerPhone.failed" |
    "order.action.agree" |
    "order.action.reject" |
    "order.action.receive" |
    "order.list.unit" |
    "order.list.header.product" |
    "order.list.header.orderNo" |
    "order.list.header.buyer" |
    "order.list.header.payAmount" |
    "order.list.header.status" |
    "order.list.header.createdAt" |
    "order.list.header.action" |
    "order.list.items.total" |
    "order.list.badge.shipOverdue" |
    "order.list.action.ship" |
    "order.empty.title" |
    "order.empty.description" |
    "order.ship.title" |
    "order.ship.orderNoLabel" |
    "order.ship.carrier.label" |
    "order.ship.carrier.placeholder" |
    "order.ship.carrier.empty" |
    "order.ship.tracking.label" |
    "order.ship.tracking.placeholder" |
    "order.ship.submit" |
    "order.refund.unit" |
    "order.refund.header.ticket" |
    "order.refund.header.product" |
    "order.refund.header.orderNo" |
    "order.refund.header.buyer" |
    "order.refund.header.refundAmount" |
    "order.refund.header.reason" |
    "order.refund.header.appliedAt" |
    "order.refund.header.action" |
    "order.refund.items.total" |
    "order.refund.noNote" |
    "order.refund.sevenDayHint" |
    "order.refund.handled" |
    "order.refund.empty.title" |
    "order.refund.empty.description" |
    "order.decision.title.agree" |
    "order.decision.title.reject" |
    "order.decision.title.receive" |
    "order.decision.desc.rejectNoTicket" |
    "order.decision.desc.rejectReturning" |
    "order.decision.desc.rejectOther" |
    "order.decision.desc.receive" |
    "order.decision.desc.agreeNoTicket" |
    "order.decision.desc.agreeReturnRefund" |
    "order.decision.desc.agreeRefundOnly" |
    "order.decision.defaultCarrier" |
    "order.decision.noReturnTracking" |
    "order.decision.row.orderNo" |
    "order.decision.row.type" |
    "order.decision.row.refundAmount" |
    "order.decision.row.reason" |
    "order.decision.row.note" |
    "order.decision.row.returnShipment" |
    "order.decision.wholePaidSuffix" |
    "order.decision.sevenDayNoReject" |
    "order.decision.noBuyerNote" |
    "order.decision.loading" |
    "order.decision.loadFailed" |
    "order.decision.notFound" |
    "order.decision.reason.label" |
    "order.decision.reason.placeholder" |
    "order.decision.reason.submit" |
    "order.decision.confirmAgree" |
    "order.decision.confirmReceive"

/** namespace `product`：165 条。收窄入口 `SellerScopedT<"product">` */
export type ProductKeys =
    "product.publish.forbiddenWordHit" |
    "product.status.PUBLISHED" |
    "product.status.WAREHOUSE" |
    "product.status.DRAFT" |
    "product.err.priceFormat" |
    "product.err.countFormat" |
    "product.err.priceFirst" |
    "product.err.imagesRequired" |
    "product.toast.skuOkPrice" |
    "product.toast.skuOkStock" |
    "product.toast.saveFailed" |
    "product.toast.titleUpdated" |
    "product.toast.offShelf" |
    "product.toast.offShelfFailed" |
    "product.toast.onShelf" |
    "product.toast.onShelfFailed" |
    "product.toast.specGenFailed" |
    "product.toast.draftSaved" |
    "product.skuEdit.price.title" |
    "product.skuEdit.price.notice" |
    "product.skuEdit.stock.title" |
    "product.skuEdit.stock.notice" |
    "product.list.header.name" |
    "product.list.header.price" |
    "product.list.header.stock" |
    "product.list.header.soldCount" |
    "product.list.header.createdAt" |
    "product.list.header.action" |
    "product.list.sort.aria" |
    "product.list.copy.nameLabel" |
    "product.list.editTitle.aria" |
    "product.list.editTitle.tooltip" |
    "product.list.editPrice.aria" |
    "product.list.editPrice.tooltip" |
    "product.list.editStock.aria" |
    "product.list.editStock.tooltip" |
    "product.list.action.edit" |
    "product.list.action.offShelf" |
    "product.list.action.onShelf" |
    "product.list.confirm.offShelf.title" |
    "product.list.confirm.offShelf.body" |
    "product.list.confirm.offShelf.confirm" |
    "product.list.pagination.unit" |
    "product.list.empty.filtered.title" |
    "product.list.empty.filtered.body" |
    "product.list.empty.initial.title" |
    "product.list.empty.initial.body" |
    "product.filter.title.label" |
    "product.filter.title.placeholder" |
    "product.sku.col.spec" |
    "product.sku.singleSpec" |
    "product.sku.col.price" |
    "product.sku.col.count" |
    "product.sku.col.sellerCode" |
    "product.sku.col.skuCategory" |
    "product.sku.col.onShelf" |
    "product.sku.col.action" |
    "product.sku.unit.yuan" |
    "product.sku.unit.piece" |
    "product.sku.batch.priceLabel" |
    "product.sku.batch.countLabel" |
    "product.sku.batch.submit" |
    "product.sku.search.placeholder" |
    "product.sku.fullscreen.enter" |
    "product.sku.fullscreen.exit" |
    "product.sku.skuCategory.placeholder" |
    "product.sku.skuCategory.tooltip" |
    "product.sku.onShelf.aria" |
    "product.sku.sellerCode.placeholder" |
    "product.sku.delete" |
    "product.sku.empty.noMatch" |
    "product.sales.title" |
    "product.sales.specs.label" |
    "product.sales.specs.desc" |
    "product.sales.specs.noAttr" |
    "product.sales.grid.label" |
    "product.sales.price.label" |
    "product.sales.price.desc" |
    "product.sales.stock.label" |
    "product.sales.stock.desc" |
    "product.sales.stock.count" |
    "product.sales.listingTime.label" |
    "product.sales.listingTime.now" |
    "product.sales.listingTime.warehouse" |
    "product.sales.listingTime.lockedNotice" |
    "product.basic.section.category" |
    "product.basic.section.info" |
    "product.basic.section.sales" |
    "product.basic.section.detail" |
    "product.basic.header.title" |
    "product.basic.header.requiredPrefix" |
    "product.basic.header.requiredSuffix" |
    "product.basic.header.stepCategory" |
    "product.basic.header.stepInfo" |
    "product.basic.category.label" |
    "product.basic.category.switch" |
    "product.basic.category.switchLockedNotice" |
    "product.basic.action.saveDraft" |
    "product.basic.action.submit" |
    "product.basic.action.saveChanges" |
    "product.info.title" |
    "product.info.images.label" |
    "product.info.images.uploadLabel" |
    "product.info.images.coverLabel" |
    "product.info.images.hint" |
    "product.info.name.label" |
    "product.info.name.placeholder" |
    "product.info.name.hint" |
    "product.info.subtitle.label" |
    "product.info.subtitle.placeholder" |
    "product.info.subtitle.hint" |
    "product.info.sevenDay.label" |
    "product.info.sevenDay.hint" |
    "product.detail.title" |
    "product.detail.images.label" |
    "product.detail.images.uploadLabel" |
    "product.detail.images.hint" |
    "product.editSku.productLabel" |
    "product.editSku.col.sku" |
    "product.editSku.col.price" |
    "product.editSku.col.stock" |
    "product.editSku.col.skuCode" |
    "product.editSku.price.aria" |
    "product.editSku.stock.aria" |
    "product.editSku.skuCode.aria" |
    "product.editSku.skuCode.placeholder" |
    "product.editSku.submit" |
    "product.editTitle.title" |
    "product.editTitle.name.label" |
    "product.editTitle.name.placeholder" |
    "product.editTitle.subtitle.label" |
    "product.editTitle.subtitle.placeholder" |
    "product.editTitle.subtitle.hint" |
    "product.editTitle.submit" |
    "product.category.tab.search" |
    "product.category.tab.image" |
    "product.category.tab.imageComingSoon" |
    "product.category.search.placeholder" |
    "product.category.search.submit" |
    "product.category.search.selectCategory" |
    "product.category.confirm.label" |
    "product.category.confirm.emptyHint" |
    "product.category.confirm.next" |
    "product.category.col.filterPlaceholder" |
    "product.category.col.filterAria" |
    "product.category.col.noMatch" |
    "product.category.col.reachedLeaf" |
    "product.category.col.needParent" |
    "product.category.result.emptyTitle" |
    "product.category.result.emptyBody" |
    "product.category.result.count" |
    "product.attrs.value.placeholderCustom" |
    "product.attrs.value.placeholderSelect" |
    "product.attrs.value.comboboxEmpty" |
    "product.attrs.value.notePlaceholder" |
    "product.attrs.value.removeAria" |
    "product.attrs.important" |
    "product.attrs.addAria" |
    "product.attrs.maxReached" |
    "product.gate.notice.warehouse" |
    "product.gate.notice.published" |
    "product.gate.error.needShop" |
    "product.gate.error.needShopAndCategory" |
    "product.gate.error.publishUnpriced" |
    "product.gate.error.priceRequired"

/** namespace `review`：20 条。收窄入口 `SellerScopedT<"review">` */
export type ReviewKeys =
    "review.toast.replyPublished" |
    "review.toast.replyFailed" |
    "review.page.empty.title" |
    "review.page.empty.description" |
    "review.list.pagination.unit" |
    "review.list.header.product" |
    "review.list.header.rating" |
    "review.list.header.content" |
    "review.list.header.time" |
    "review.list.header.action" |
    "review.list.stars.aria" |
    "review.list.content.onlyRating" |
    "review.list.badge.append" |
    "review.list.replied" |
    "review.reply.action" |
    "review.reply.dialog.title" |
    "review.reply.dialog.subject" |
    "review.reply.form.label" |
    "review.reply.form.placeholder" |
    "review.reply.form.submit"

/** namespace `shipping`：43 条。收窄入口 `SellerScopedT<"shipping">` */
export type ShippingKeys =
    "shipping.region.title" |
    "shipping.region.hint" |
    "shipping.region.add" |
    "shipping.region.emptyHint" |
    "shipping.region.itemTitle" |
    "shipping.region.removeAria" |
    "shipping.region.coverage" |
    "shipping.freeShipping.title" |
    "shipping.freeShipping.hint" |
    "shipping.freeShipping.field" |
    "shipping.freeShipping.fieldHint" |
    "shipping.freeShipping.onHint" |
    "shipping.freeShipping.quantityLabel" |
    "shipping.freeShipping.amountLabel" |
    "shipping.freeShipping.thresholdPlaceholder" |
    "shipping.default.title" |
    "shipping.default.hint" |
    "shipping.blocked.title" |
    "shipping.blocked.hint" |
    "shipping.blocked.field" |
    "shipping.blocked.placeholder" |
    "shipping.tier.firstQuantity" |
    "shipping.tier.firstFee" |
    "shipping.tier.addQuantity" |
    "shipping.tier.addFee" |
    "shipping.regionPicker.placeholder" |
    "shipping.regionPicker.searchPlaceholder" |
    "shipping.regionPicker.selectedCount" |
    "shipping.empty.title" |
    "shipping.editNotice" |
    "shipping.saveNotice" |
    "shipping.save.new" |
    "shipping.save.edit" |
    "shipping.err.firstQuantityInt" |
    "shipping.err.firstFeeFormat" |
    "shipping.err.addQuantityInt" |
    "shipping.err.addFeeFormat" |
    "shipping.err.freeOverQuantityInt" |
    "shipping.err.freeOverAmountFormat" |
    "shipping.err.regionMissing" |
    "shipping.err.duplicateRegion" |
    "shipping.err.excludedConflict" |
    "shipping.toast.saved"

/** namespace `shop`：124 条。收窄入口 `SellerScopedT<"shop">` */
export type ShopKeys =
    "shop.list.title" |
    "shop.list.subtitle" |
    "shop.list.empty.title" |
    "shop.list.empty.body" |
    "shop.card.current" |
    "shop.card.createdAt" |
    "shop.card.setCurrent" |
    "shop.resubmit.success" |
    "shop.resubmit.error" |
    "shop.resubmit.rejectReason" |
    "shop.resubmit.rejectReasonFallback" |
    "shop.resubmit.nameLabel" |
    "shop.resubmit.submit" |
    "shop.create.error" |
    "shop.create.title" |
    "shop.create.subtitle" |
    "shop.create.nameLabel" |
    "shop.create.submit" |
    "shop.create.pending" |
    "shop.create.placeholder" |
    "shop.err.regionRequired" |
    "shop.address.saved" |
    "shop.address.updated" |
    "shop.address.deleted" |
    "shop.address.setDefaultSend" |
    "shop.address.setDefaultReturn" |
    "shop.address.table.empty.title" |
    "shop.address.table.empty.body" |
    "shop.address.table.col.address" |
    "shop.address.table.col.contact" |
    "shop.address.table.col.note" |
    "shop.address.table.col.action" |
    "shop.address.table.badge.defaultShip" |
    "shop.address.table.badge.defaultReturn" |
    "shop.address.table.action.setDefaultShip" |
    "shop.address.table.action.setDefaultReturn" |
    "shop.address.table.action.edit" |
    "shop.address.table.action.delete" |
    "shop.status.PENDING_REVIEW" |
    "shop.status.ACTIVE" |
    "shop.status.REJECTED" |
    "shop.status.DISABLED" |
    "shop.address.form.contactName.label" |
    "shop.address.form.contactName.placeholder" |
    "shop.address.form.phone.label" |
    "shop.address.form.phone.placeholder" |
    "shop.address.form.detail.label" |
    "shop.address.form.detail.placeholder" |
    "shop.address.form.postalCode.label" |
    "shop.address.form.postalCode.placeholder" |
    "shop.address.form.companyName.label" |
    "shop.address.form.companyName.placeholder" |
    "shop.address.form.note.label" |
    "shop.address.form.note.placeholder" |
    "shop.address.form.title.edit" |
    "shop.address.form.title.create" |
    "shop.address.form.defaultShip" |
    "shop.address.form.defaultReturn" |
    "shop.address.page.hint" |
    "shop.address.page.add" |
    "shop.address.delete.confirm.title" |
    "shop.address.delete.confirm.desc" |
    "shop.subaccount.title" |
    "shop.subaccount.subtitle" |
    "shop.subaccount.new.title" |
    "shop.subaccount.new.desc" |
    "shop.subaccount.new.trigger" |
    "shop.subaccount.new.loginName" |
    "shop.subaccount.new.loginNamePlaceholder" |
    "shop.subaccount.new.phone" |
    "shop.subaccount.new.phonePlaceholder" |
    "shop.subaccount.new.password" |
    "shop.subaccount.new.passwordPlaceholder" |
    "shop.subaccount.new.permissions" |
    "shop.subaccount.new.submit" |
    "shop.subaccount.new.done" |
    "shop.subaccount.new.failed" |
    "shop.subaccount.list.title" |
    "shop.subaccount.empty.title" |
    "shop.subaccount.empty.body" |
    "shop.subaccount.col.loginName" |
    "shop.subaccount.col.phone" |
    "shop.subaccount.col.status" |
    "shop.subaccount.col.permissions" |
    "shop.subaccount.col.createdAt" |
    "shop.subaccount.col.actions" |
    "shop.subaccount.permissions.none" |
    "shop.subaccount.status.PENDING_ACTIVATION" |
    "shop.subaccount.status.ACTIVE" |
    "shop.subaccount.status.DISABLED" |
    "shop.subaccount.permission.PRODUCT_MANAGE" |
    "shop.subaccount.permission.ORDER_FULFILL" |
    "shop.subaccount.permission.ADDRESS_MANAGE" |
    "shop.subaccount.permission.SHIPPING_MANAGE" |
    "shop.subaccount.permission.COUPON_MANAGE" |
    "shop.subaccount.action.disable" |
    "shop.subaccount.action.enable" |
    "shop.subaccount.action.resetPassword" |
    "shop.subaccount.action.permissions" |
    "shop.subaccount.action.remove" |
    "shop.subaccount.action.cancel" |
    "shop.subaccount.disable.confirm.title" |
    "shop.subaccount.disable.confirm.desc" |
    "shop.subaccount.disable.failed" |
    "shop.subaccount.enable.confirm.title" |
    "shop.subaccount.enable.confirm.desc" |
    "shop.subaccount.enable.failed" |
    "shop.subaccount.remove.confirm.title" |
    "shop.subaccount.remove.confirm.desc" |
    "shop.subaccount.remove.confirm.action" |
    "shop.subaccount.remove.done" |
    "shop.subaccount.remove.failed" |
    "shop.subaccount.reset.title" |
    "shop.subaccount.reset.desc" |
    "shop.subaccount.reset.password" |
    "shop.subaccount.reset.passwordPlaceholder" |
    "shop.subaccount.reset.submit" |
    "shop.subaccount.reset.done" |
    "shop.subaccount.reset.failed" |
    "shop.subaccount.permission.edit.title" |
    "shop.subaccount.permission.edit.save" |
    "shop.subaccount.permission.edit.done" |
    "shop.subaccount.permission.edit.failed" |
    "shop.subaccount.phone.failed"

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
    "coupon": CouponKeys
    "layout": LayoutKeys
    "login": LoginKeys
    "nav": NavKeys
    "order": OrderKeys
    "product": ProductKeys
    "review": ReviewKeys
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
    "common.tableCard.total": { total: string | number; unit: string | number }
    "common.upload.directFailed": { status: string | number }
    "coupon.form.err.nameMax": { max: string | number }
    "coupon.form.err.totalMax": { max: string | number }
    "coupon.form.err.validDaysRange": { min: string | number; max: string | number }
    "coupon.list.confirm.stop.desc": { name: string | number }
    "coupon.list.issued": { issued: string | number; total: string | number }
    "coupon.list.progress.aria": { name: string | number; issued: string | number; total: string | number }
    "coupon.list.used": { used: string | number }
    "coupon.rule.rate.noThreshold": { rate: string | number }
    "coupon.rule.rate.noThresholdCapped": { rate: string | number; cap: string | number }
    "coupon.rule.rate.threshold": { threshold: string | number; rate: string | number }
    "coupon.rule.rate.thresholdCapped": { threshold: string | number; rate: string | number; cap: string | number }
    "coupon.rule.reduction.noThreshold": { discount: string | number }
    "coupon.rule.reduction.threshold": { threshold: string | number; discount: string | number }
    "order.list.items.total": { count: string | number }
    "order.refund.items.total": { count: string | number }
    "product.attrs.maxReached": { max: string | number }
    "product.category.result.count": { count: string | number }
    "product.category.result.emptyTitle": { keyword: string | number }
    "product.editSku.price.aria": { label: string | number }
    "product.editSku.skuCode.aria": { label: string | number }
    "product.editSku.skuCode.placeholder": { max: string | number }
    "product.editSku.stock.aria": { label: string | number }
    "product.editTitle.subtitle.placeholder": { min: string | number; max: string | number }
    "product.info.subtitle.hint": { min: string | number; max: string | number }
    "product.list.confirm.offShelf.body": { name: string | number }
    "product.list.sort.aria": { label: string | number; dir: "asc" | "desc" | "other" }
    "product.publish.forbiddenWordHit": { word: string | number }
    "product.sales.stock.count": { count: string | number }
    "review.list.stars.aria": { value: number }
    "review.reply.dialog.subject": { product: string | number; buyer: string | number }
    "shipping.err.duplicateRegion": { prefix: string | number }
    "shipping.err.excludedConflict": { prefix: string | number }
    "shipping.err.regionMissing": { index: string | number }
    "shipping.region.itemTitle": { index: string | number }
    "shipping.regionPicker.selectedCount": { count: string | number }
    "shop.address.delete.confirm.desc": { name: string | number }
    "shop.card.createdAt": { date: string | number }
    "shop.resubmit.rejectReason": { reason: string | number }
    "shop.subaccount.disable.confirm.desc": { loginName: string | number }
    "shop.subaccount.enable.confirm.desc": { loginName: string | number }
    "shop.subaccount.new.password": { min: string | number }
    "shop.subaccount.permission.edit.title": { loginName: string | number }
    "shop.subaccount.remove.confirm.desc": { loginName: string | number }
    "shop.subaccount.reset.desc": { loginName: string | number }
    "shop.subaccount.reset.password": { min: string | number }
    "shop.subaccount.subtitle": { name: string | number }
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
