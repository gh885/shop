// 生成物，别手改：pnpm gen:i18n（判据与清单见 scripts/i18n-codegen.mjs、docs/conventions/i18n.md §5.5）
// 来源：apps/seller/src/locales/{zh-CN, en-US}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致。这条保证属于生成期，手改这份文件不会让它成立。

import type { AppKitMessageKey, AppKitParamsOf } from "@shop/app-kit/i18n"

/** namespace `account`：3 条。收窄入口 `SellerScopedT<"account">` */
export type AccountKeys =
    "seller.account.notLoggedIn" |
    "seller.account.description" |
    "seller.account.logout"

/** namespace `app`：1 条。收窄入口 `SellerScopedT<"app">` */
export type AppKeys =
    "app.title"

/** namespace `common`：20 条。收窄入口 `SellerScopedT<"common">` */
export type CommonKeys =
    "common.notFound.title" |
    "common.notFound.description" |
    "common.action.backHome" |
    "common.unpriced" |
    "common.loadFailed.carriers" |
    "common.loadFailed.specTemplate" |
    "common.loadFailed.sku" |
    "common.loadFailed.categoryTree" |
    "common.loadFailed.invites" |
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
    "seller.coupon.rule.reduction.threshold" |
    "seller.coupon.rule.reduction.noThreshold" |
    "seller.coupon.rule.rate.threshold" |
    "seller.coupon.rule.rate.thresholdCapped" |
    "seller.coupon.rule.rate.noThreshold" |
    "seller.coupon.rule.rate.noThresholdCapped" |
    "seller.coupon.form.title" |
    "seller.coupon.form.intro" |
    "seller.coupon.form.name.label" |
    "seller.coupon.form.name.placeholder" |
    "seller.coupon.form.type.label" |
    "seller.coupon.type.FULL_REDUCTION" |
    "seller.coupon.type.DISCOUNT" |
    "seller.coupon.form.threshold.label" |
    "seller.coupon.form.threshold.placeholder" |
    "seller.coupon.form.rate.label" |
    "seller.coupon.form.rate.placeholder" |
    "seller.coupon.form.discount.label" |
    "seller.coupon.form.discount.placeholder" |
    "seller.coupon.form.maxDiscount.label" |
    "seller.coupon.form.maxDiscount.placeholder" |
    "seller.coupon.form.maxDiscount.hint" |
    "seller.coupon.form.total.label" |
    "seller.coupon.form.total.placeholder" |
    "seller.coupon.form.windowFrom.label" |
    "seller.coupon.form.windowFrom.hint" |
    "seller.coupon.form.windowTo.label" |
    "seller.coupon.form.windowTo.hint" |
    "seller.coupon.form.validDays.label" |
    "seller.coupon.form.validDays.placeholder" |
    "seller.coupon.form.validDays.hint" |
    "seller.coupon.form.submit" |
    "seller.coupon.form.err.nameRequired" |
    "seller.coupon.form.err.nameMax" |
    "seller.coupon.form.err.thresholdRequired" |
    "seller.coupon.form.err.thresholdFormat" |
    "seller.coupon.form.err.totalRequired" |
    "seller.coupon.form.err.totalInt" |
    "seller.coupon.form.err.totalMax" |
    "seller.coupon.form.err.windowFromRequired" |
    "seller.coupon.form.err.windowToRequired" |
    "seller.coupon.form.err.rateRange" |
    "seller.coupon.form.err.maxDiscountRequired" |
    "seller.coupon.form.err.maxDiscountFormat" |
    "seller.coupon.form.err.discountRequired" |
    "seller.coupon.form.err.discountPositive" |
    "seller.coupon.form.err.discountOverThreshold" |
    "seller.coupon.form.err.validDaysRange" |
    "seller.coupon.form.err.windowOrder" |
    "seller.coupon.toast.created" |
    "seller.coupon.toast.disabled" |
    "seller.coupon.status.NOT_STARTED" |
    "seller.coupon.status.ONGOING" |
    "seller.coupon.status.ENDED" |
    "seller.coupon.status.STOPPED" |
    "seller.coupon.page.intro" |
    "seller.coupon.page.create" |
    "seller.coupon.page.noEditNotice" |
    "seller.coupon.page.empty.title" |
    "seller.coupon.page.empty.description" |
    "seller.coupon.list.pagination.unit" |
    "seller.coupon.list.header.name" |
    "seller.coupon.list.header.rule" |
    "seller.coupon.list.header.period" |
    "seller.coupon.list.header.issueStatus" |
    "seller.coupon.list.header.status" |
    "seller.coupon.list.header.createdAt" |
    "seller.coupon.list.header.action" |
    "seller.coupon.list.issued" |
    "seller.coupon.list.used" |
    "seller.coupon.list.progress.aria" |
    "seller.coupon.list.confirm.stop.title" |
    "seller.coupon.list.confirm.stop.desc" |
    "seller.coupon.list.confirm.stop.confirm" |
    "seller.coupon.action.stop"

/** namespace `layout`：2 条。收窄入口 `SellerScopedT<"layout">` */
export type LayoutKeys =
    "seller.layout.workbench" |
    "seller.layout.brand"

/** namespace `login`：5 条。收窄入口 `SellerScopedT<"login">` */
export type LoginKeys =
    "seller.login.title" |
    "seller.login.welcome" |
    "seller.login.headline" |
    "seller.login.pitch" |
    "seller.login.youAreHere"

/** namespace `nav`：42 条。收窄入口 `SellerScopedT<"nav">` */
export type NavKeys =
    "seller.nav.home" |
    "seller.nav.trade" |
    "seller.nav.trade.section.0" |
    "seller.nav.trade.section.1" |
    "seller.nav.trade.order" |
    "seller.nav.trade.shipping" |
    "seller.nav.trade.ship" |
    "seller.nav.trade.logistics" |
    "seller.nav.trade.refund" |
    "seller.nav.trade.review" |
    "seller.nav.trade.buyershow" |
    "seller.nav.product" |
    "seller.nav.product.section.0" |
    "seller.nav.product.section.1" |
    "seller.nav.product.list" |
    "seller.nav.product.create" |
    "seller.nav.product.category" |
    "seller.nav.product.stock" |
    "seller.nav.product.supplier" |
    "seller.nav.product.purchase" |
    "seller.nav.product.price" |
    "seller.nav.shop" |
    "seller.nav.shop.section.0" |
    "seller.nav.shop.section.1" |
    "seller.nav.shop.list" |
    "seller.nav.shop.address" |
    "seller.nav.shop.member" |
    "seller.nav.shop.decoration" |
    "seller.nav.shop.notice" |
    "seller.nav.shop.license" |
    "seller.nav.shop.brand" |
    "seller.nav.marketing" |
    "seller.nav.marketing.section.0" |
    "seller.nav.marketing.campaign" |
    "seller.nav.marketing.coupon" |
    "seller.nav.marketing.flash" |
    "seller.nav.service" |
    "seller.nav.data" |
    "seller.nav.data.section.0" |
    "seller.nav.data.overview" |
    "seller.nav.data.report" |
    "seller.nav.data.visit"

/** namespace `order`：100 条。收窄入口 `SellerScopedT<"order">` */
export type OrderKeys =
    "seller.order.tab.all" |
    "seller.order.status.PENDING_PAYMENT" |
    "seller.order.status.PAID" |
    "seller.order.status.SHIPPED" |
    "seller.order.status.COMPLETED" |
    "seller.order.status.CANCELLED" |
    "seller.order.afterSale.APPLYING" |
    "seller.order.afterSale.RETURNING" |
    "seller.order.afterSale.REFUNDED" |
    "seller.order.afterSale.REJECTED" |
    "seller.order.afterSale.CLOSED" |
    "seller.order.ticketType.REFUND_ONLY" |
    "seller.order.ticketType.RETURN_REFUND" |
    "seller.order.ticketStatus.APPLYING" |
    "seller.order.ticketStatus.RETURNING" |
    "seller.order.ticketStatus.REFUNDED" |
    "seller.order.ticketStatus.REJECTED" |
    "seller.order.ticketStatus.CLOSED" |
    "seller.order.reason.NO_REASON" |
    "seller.order.reason.QUALITY_ISSUE" |
    "seller.order.reason.NOT_AS_DESCRIBED" |
    "seller.order.reason.DAMAGED" |
    "seller.order.reason.WRONG_ITEM" |
    "seller.order.reason.MISSING_ITEM" |
    "seller.order.reason.OTHER" |
    "seller.order.reason.none" |
    "seller.order.toast.shipped" |
    "seller.order.toast.shipFailed" |
    "seller.order.toast.agreeAfterSale" |
    "seller.order.toast.rejectAfterSale" |
    "seller.order.toast.refundConfirmed" |
    "seller.order.toast.buyerPhone.failed" |
    "seller.order.action.agree" |
    "seller.order.action.reject" |
    "seller.order.action.receive" |
    "seller.order.list.unit" |
    "seller.order.list.header.product" |
    "seller.order.list.header.orderNo" |
    "seller.order.list.header.buyer" |
    "seller.order.list.header.payAmount" |
    "seller.order.list.header.status" |
    "seller.order.list.header.createdAt" |
    "seller.order.list.header.action" |
    "seller.order.list.items.total" |
    "seller.order.list.badge.shipOverdue" |
    "seller.order.list.action.ship" |
    "seller.order.empty.title" |
    "seller.order.empty.description" |
    "seller.order.ship.title" |
    "seller.order.ship.orderNoLabel" |
    "seller.order.ship.carrier.label" |
    "seller.order.ship.carrier.placeholder" |
    "seller.order.ship.carrier.empty" |
    "seller.order.ship.tracking.label" |
    "seller.order.ship.tracking.placeholder" |
    "seller.order.ship.submit" |
    "seller.order.refund.unit" |
    "seller.order.refund.header.ticket" |
    "seller.order.refund.header.product" |
    "seller.order.refund.header.orderNo" |
    "seller.order.refund.header.buyer" |
    "seller.order.refund.header.refundAmount" |
    "seller.order.refund.header.reason" |
    "seller.order.refund.header.appliedAt" |
    "seller.order.refund.header.action" |
    "seller.order.refund.items.total" |
    "seller.order.refund.noNote" |
    "seller.order.refund.sevenDayHint" |
    "seller.order.refund.handled" |
    "seller.order.refund.empty.title" |
    "seller.order.refund.empty.description" |
    "seller.order.decision.title.agree" |
    "seller.order.decision.title.reject" |
    "seller.order.decision.title.receive" |
    "seller.order.decision.desc.rejectNoTicket" |
    "seller.order.decision.desc.rejectReturning" |
    "seller.order.decision.desc.rejectOther" |
    "seller.order.decision.desc.receive" |
    "seller.order.decision.desc.agreeNoTicket" |
    "seller.order.decision.desc.agreeReturnRefund" |
    "seller.order.decision.desc.agreeRefundOnly" |
    "seller.order.decision.defaultCarrier" |
    "seller.order.decision.noReturnTracking" |
    "seller.order.decision.row.orderNo" |
    "seller.order.decision.row.type" |
    "seller.order.decision.row.refundAmount" |
    "seller.order.decision.row.reason" |
    "seller.order.decision.row.note" |
    "seller.order.decision.row.returnShipment" |
    "seller.order.decision.wholePaidSuffix" |
    "seller.order.decision.sevenDayNoReject" |
    "seller.order.decision.noBuyerNote" |
    "seller.order.decision.loading" |
    "seller.order.decision.loadFailed" |
    "seller.order.decision.notFound" |
    "seller.order.decision.reason.label" |
    "seller.order.decision.reason.placeholder" |
    "seller.order.decision.reason.submit" |
    "seller.order.decision.confirmAgree" |
    "seller.order.decision.confirmReceive"

/** namespace `product`：165 条。收窄入口 `SellerScopedT<"product">` */
export type ProductKeys =
    "product.publish.forbiddenWordHit" |
    "seller.product.status.PUBLISHED" |
    "seller.product.status.WAREHOUSE" |
    "seller.product.status.DRAFT" |
    "seller.product.err.priceFormat" |
    "seller.product.err.countFormat" |
    "seller.product.err.priceFirst" |
    "seller.product.err.imagesRequired" |
    "seller.product.toast.skuOkPrice" |
    "seller.product.toast.skuOkStock" |
    "seller.product.toast.saveFailed" |
    "seller.product.toast.titleUpdated" |
    "seller.product.toast.offShelf" |
    "seller.product.toast.offShelfFailed" |
    "seller.product.toast.onShelf" |
    "seller.product.toast.onShelfFailed" |
    "seller.product.toast.specGenFailed" |
    "seller.product.toast.draftSaved" |
    "seller.product.skuEdit.price.title" |
    "seller.product.skuEdit.price.notice" |
    "seller.product.skuEdit.stock.title" |
    "seller.product.skuEdit.stock.notice" |
    "seller.product.list.header.name" |
    "seller.product.list.header.price" |
    "seller.product.list.header.stock" |
    "seller.product.list.header.soldCount" |
    "seller.product.list.header.createdAt" |
    "seller.product.list.header.action" |
    "seller.product.list.sort.aria" |
    "seller.product.list.copy.nameLabel" |
    "seller.product.list.editTitle.aria" |
    "seller.product.list.editTitle.tooltip" |
    "seller.product.list.editPrice.aria" |
    "seller.product.list.editPrice.tooltip" |
    "seller.product.list.editStock.aria" |
    "seller.product.list.editStock.tooltip" |
    "seller.product.list.action.edit" |
    "seller.product.list.action.offShelf" |
    "seller.product.list.action.onShelf" |
    "seller.product.list.confirm.offShelf.title" |
    "seller.product.list.confirm.offShelf.body" |
    "seller.product.list.confirm.offShelf.confirm" |
    "seller.product.list.pagination.unit" |
    "seller.product.list.empty.filtered.title" |
    "seller.product.list.empty.filtered.body" |
    "seller.product.list.empty.initial.title" |
    "seller.product.list.empty.initial.body" |
    "seller.product.filter.title.label" |
    "seller.product.filter.title.placeholder" |
    "seller.product.sku.col.spec" |
    "seller.product.sku.singleSpec" |
    "seller.product.sku.col.price" |
    "seller.product.sku.col.count" |
    "seller.product.sku.col.sellerCode" |
    "seller.product.sku.col.skuCategory" |
    "seller.product.sku.col.onShelf" |
    "seller.product.sku.col.action" |
    "seller.product.sku.unit.yuan" |
    "seller.product.sku.unit.piece" |
    "seller.product.sku.batch.priceLabel" |
    "seller.product.sku.batch.countLabel" |
    "seller.product.sku.batch.submit" |
    "seller.product.sku.search.placeholder" |
    "seller.product.sku.fullscreen.enter" |
    "seller.product.sku.fullscreen.exit" |
    "seller.product.sku.skuCategory.placeholder" |
    "seller.product.sku.skuCategory.tooltip" |
    "seller.product.sku.onShelf.aria" |
    "seller.product.sku.sellerCode.placeholder" |
    "seller.product.sku.delete" |
    "seller.product.sku.empty.noMatch" |
    "seller.product.sales.title" |
    "seller.product.sales.specs.label" |
    "seller.product.sales.specs.desc" |
    "seller.product.sales.specs.noAttr" |
    "seller.product.sales.grid.label" |
    "seller.product.sales.price.label" |
    "seller.product.sales.price.desc" |
    "seller.product.sales.stock.label" |
    "seller.product.sales.stock.desc" |
    "seller.product.sales.stock.count" |
    "seller.product.sales.listingTime.label" |
    "seller.product.sales.listingTime.now" |
    "seller.product.sales.listingTime.warehouse" |
    "seller.product.sales.listingTime.lockedNotice" |
    "seller.product.basic.section.category" |
    "seller.product.basic.section.info" |
    "seller.product.basic.section.sales" |
    "seller.product.basic.section.detail" |
    "seller.product.basic.header.title" |
    "seller.product.basic.header.requiredPrefix" |
    "seller.product.basic.header.requiredSuffix" |
    "seller.product.basic.header.stepCategory" |
    "seller.product.basic.header.stepInfo" |
    "seller.product.basic.category.label" |
    "seller.product.basic.category.switch" |
    "seller.product.basic.category.switchLockedNotice" |
    "seller.product.basic.action.saveDraft" |
    "seller.product.basic.action.submit" |
    "seller.product.basic.action.saveChanges" |
    "seller.product.info.title" |
    "seller.product.info.images.label" |
    "seller.product.info.images.uploadLabel" |
    "seller.product.info.images.coverLabel" |
    "seller.product.info.images.hint" |
    "seller.product.info.name.label" |
    "seller.product.info.name.placeholder" |
    "seller.product.info.name.hint" |
    "seller.product.info.subtitle.label" |
    "seller.product.info.subtitle.placeholder" |
    "seller.product.info.subtitle.hint" |
    "seller.product.info.sevenDay.label" |
    "seller.product.info.sevenDay.hint" |
    "seller.product.detail.title" |
    "seller.product.detail.images.label" |
    "seller.product.detail.images.uploadLabel" |
    "seller.product.detail.images.hint" |
    "seller.product.editSku.productLabel" |
    "seller.product.editSku.col.sku" |
    "seller.product.editSku.col.price" |
    "seller.product.editSku.col.stock" |
    "seller.product.editSku.col.skuCode" |
    "seller.product.editSku.price.aria" |
    "seller.product.editSku.stock.aria" |
    "seller.product.editSku.skuCode.aria" |
    "seller.product.editSku.skuCode.placeholder" |
    "seller.product.editSku.submit" |
    "seller.product.editTitle.title" |
    "seller.product.editTitle.name.label" |
    "seller.product.editTitle.name.placeholder" |
    "seller.product.editTitle.subtitle.label" |
    "seller.product.editTitle.subtitle.placeholder" |
    "seller.product.editTitle.subtitle.hint" |
    "seller.product.editTitle.submit" |
    "seller.product.category.tab.search" |
    "seller.product.category.tab.image" |
    "seller.product.category.tab.imageComingSoon" |
    "seller.product.category.search.placeholder" |
    "seller.product.category.search.submit" |
    "seller.product.category.search.selectCategory" |
    "seller.product.category.confirm.label" |
    "seller.product.category.confirm.emptyHint" |
    "seller.product.category.confirm.next" |
    "seller.product.category.col.filterPlaceholder" |
    "seller.product.category.col.filterAria" |
    "seller.product.category.col.noMatch" |
    "seller.product.category.col.reachedLeaf" |
    "seller.product.category.col.needParent" |
    "seller.product.category.result.emptyTitle" |
    "seller.product.category.result.emptyBody" |
    "seller.product.category.result.count" |
    "seller.product.attrs.value.placeholderCustom" |
    "seller.product.attrs.value.placeholderSelect" |
    "seller.product.attrs.value.comboboxEmpty" |
    "seller.product.attrs.value.notePlaceholder" |
    "seller.product.attrs.value.removeAria" |
    "seller.product.attrs.important" |
    "seller.product.attrs.addAria" |
    "seller.product.attrs.maxReached" |
    "seller.product.gate.notice.warehouse" |
    "seller.product.gate.notice.published" |
    "seller.product.gate.error.needShop" |
    "seller.product.gate.error.needShopAndCategory" |
    "seller.product.gate.error.publishUnpriced" |
    "seller.product.gate.error.priceRequired"

/** namespace `review`：20 条。收窄入口 `SellerScopedT<"review">` */
export type ReviewKeys =
    "seller.review.toast.replyPublished" |
    "seller.review.toast.replyFailed" |
    "seller.review.page.empty.title" |
    "seller.review.page.empty.description" |
    "seller.review.list.pagination.unit" |
    "seller.review.list.header.product" |
    "seller.review.list.header.rating" |
    "seller.review.list.header.content" |
    "seller.review.list.header.time" |
    "seller.review.list.header.action" |
    "seller.review.list.stars.aria" |
    "seller.review.list.content.onlyRating" |
    "seller.review.list.badge.append" |
    "seller.review.list.replied" |
    "seller.review.reply.action" |
    "seller.review.reply.dialog.title" |
    "seller.review.reply.dialog.subject" |
    "seller.review.reply.form.label" |
    "seller.review.reply.form.placeholder" |
    "seller.review.reply.form.submit"

/** namespace `shipping`：43 条。收窄入口 `SellerScopedT<"shipping">` */
export type ShippingKeys =
    "seller.shipping.region.title" |
    "seller.shipping.region.hint" |
    "seller.shipping.region.add" |
    "seller.shipping.region.emptyHint" |
    "seller.shipping.region.itemTitle" |
    "seller.shipping.region.removeAria" |
    "seller.shipping.region.coverage" |
    "seller.shipping.freeShipping.title" |
    "seller.shipping.freeShipping.hint" |
    "seller.shipping.freeShipping.field" |
    "seller.shipping.freeShipping.fieldHint" |
    "seller.shipping.freeShipping.onHint" |
    "seller.shipping.freeShipping.quantityLabel" |
    "seller.shipping.freeShipping.amountLabel" |
    "seller.shipping.freeShipping.thresholdPlaceholder" |
    "seller.shipping.default.title" |
    "seller.shipping.default.hint" |
    "seller.shipping.blocked.title" |
    "seller.shipping.blocked.hint" |
    "seller.shipping.blocked.field" |
    "seller.shipping.blocked.placeholder" |
    "seller.shipping.tier.firstQuantity" |
    "seller.shipping.tier.firstFee" |
    "seller.shipping.tier.addQuantity" |
    "seller.shipping.tier.addFee" |
    "seller.shipping.regionPicker.placeholder" |
    "seller.shipping.regionPicker.searchPlaceholder" |
    "seller.shipping.regionPicker.selectedCount" |
    "seller.shipping.empty.title" |
    "seller.shipping.editNotice" |
    "seller.shipping.saveNotice" |
    "seller.shipping.save.new" |
    "seller.shipping.save.edit" |
    "seller.shipping.err.firstQuantityInt" |
    "seller.shipping.err.firstFeeFormat" |
    "seller.shipping.err.addQuantityInt" |
    "seller.shipping.err.addFeeFormat" |
    "seller.shipping.err.freeOverQuantityInt" |
    "seller.shipping.err.freeOverAmountFormat" |
    "seller.shipping.err.regionMissing" |
    "seller.shipping.err.duplicateRegion" |
    "seller.shipping.err.excludedConflict" |
    "seller.shipping.toast.saved"

/** namespace `shop`：90 条。收窄入口 `SellerScopedT<"shop">` */
export type ShopKeys =
    "seller.shop.list.title" |
    "seller.shop.list.subtitle" |
    "seller.shop.list.empty.title" |
    "seller.shop.list.empty.body" |
    "seller.shop.card.current" |
    "seller.shop.card.createdAt" |
    "seller.shop.card.setCurrent" |
    "seller.shop.resubmit.success" |
    "seller.shop.resubmit.error" |
    "seller.shop.resubmit.rejectReason" |
    "seller.shop.resubmit.rejectReasonFallback" |
    "seller.shop.resubmit.nameLabel" |
    "seller.shop.resubmit.submit" |
    "seller.shop.invite.join.success" |
    "seller.shop.invite.join.error" |
    "seller.shop.invite.reject.success" |
    "seller.shop.invite.reject.error" |
    "seller.shop.invite.sectionTitle" |
    "seller.shop.invite.body" |
    "seller.shop.invite.reject" |
    "seller.shop.invite.accept" |
    "seller.shop.create.error" |
    "seller.shop.create.title" |
    "seller.shop.create.subtitle" |
    "seller.shop.create.nameLabel" |
    "seller.shop.create.submit" |
    "seller.shop.create.pending" |
    "seller.shop.create.placeholder" |
    "seller.shop.err.regionRequired" |
    "seller.shop.member.invite.sent" |
    "seller.shop.member.invite.failed" |
    "seller.shop.member.remove.done" |
    "seller.shop.member.remove.failed" |
    "seller.shop.member.phone.failed" |
    "seller.shop.address.saved" |
    "seller.shop.address.updated" |
    "seller.shop.address.deleted" |
    "seller.shop.address.setDefaultSend" |
    "seller.shop.address.setDefaultReturn" |
    "seller.shop.address.table.empty.title" |
    "seller.shop.address.table.empty.body" |
    "seller.shop.address.table.col.address" |
    "seller.shop.address.table.col.contact" |
    "seller.shop.address.table.col.note" |
    "seller.shop.address.table.col.action" |
    "seller.shop.address.table.badge.defaultShip" |
    "seller.shop.address.table.badge.defaultReturn" |
    "seller.shop.address.table.action.setDefaultShip" |
    "seller.shop.address.table.action.setDefaultReturn" |
    "seller.shop.address.table.action.edit" |
    "seller.shop.address.table.action.delete" |
    "seller.shop.status.PENDING_REVIEW" |
    "seller.shop.status.ACTIVE" |
    "seller.shop.status.REJECTED" |
    "seller.shop.status.DISABLED" |
    "seller.shop.member.title" |
    "seller.shop.member.subtitle" |
    "seller.shop.member.list.title" |
    "seller.shop.member.empty.title" |
    "seller.shop.member.empty.body" |
    "seller.shop.member.role.OWNER" |
    "seller.shop.member.role.MEMBER" |
    "seller.shop.member.status.PENDING" |
    "seller.shop.member.action.remove" |
    "seller.shop.member.action.removeConfirm" |
    "seller.shop.member.remove.confirm.desc" |
    "seller.shop.member.invite.phone.aria" |
    "seller.shop.member.invite.phone.placeholder" |
    "seller.shop.member.invite.submit" |
    "seller.shop.member.notOwner" |
    "seller.shop.address.form.contactName.label" |
    "seller.shop.address.form.contactName.placeholder" |
    "seller.shop.address.form.phone.label" |
    "seller.shop.address.form.phone.placeholder" |
    "seller.shop.address.form.detail.label" |
    "seller.shop.address.form.detail.placeholder" |
    "seller.shop.address.form.postalCode.label" |
    "seller.shop.address.form.postalCode.placeholder" |
    "seller.shop.address.form.companyName.label" |
    "seller.shop.address.form.companyName.placeholder" |
    "seller.shop.address.form.note.label" |
    "seller.shop.address.form.note.placeholder" |
    "seller.shop.address.form.title.edit" |
    "seller.shop.address.form.title.create" |
    "seller.shop.address.form.defaultShip" |
    "seller.shop.address.form.defaultReturn" |
    "seller.shop.address.page.hint" |
    "seller.shop.address.page.add" |
    "seller.shop.address.delete.confirm.title" |
    "seller.shop.address.delete.confirm.desc"

/** namespace `topbar`：4 条。收窄入口 `SellerScopedT<"topbar">` */
export type TopbarKeys =
    "seller.topbar.messages" |
    "seller.topbar.rules" |
    "seller.topbar.help" |
    "seller.topbar.support"

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
 *  所以按 namespace 收窄的入口是 `SellerScopedT`——见 §4.2 末段。 */
export type SellerMessageKey = SellerNamespace[keyof SellerNamespace]

export type SellerParamsByKey = {
    "common.copy.ariaLabel": { label: string | number; value: string | number }
    "common.copy.tooltip": { label: string | number }
    "common.tableCard.total": { total: string | number; unit: string | number }
    "common.upload.directFailed": { status: string | number }
    "product.publish.forbiddenWordHit": { word: string | number }
    "seller.coupon.form.err.nameMax": { max: string | number }
    "seller.coupon.form.err.totalMax": { max: string | number }
    "seller.coupon.form.err.validDaysRange": { min: string | number; max: string | number }
    "seller.coupon.list.confirm.stop.desc": { name: string | number }
    "seller.coupon.list.issued": { issued: string | number; total: string | number }
    "seller.coupon.list.progress.aria": { name: string | number; issued: string | number; total: string | number }
    "seller.coupon.list.used": { used: string | number }
    "seller.coupon.rule.rate.noThreshold": { rate: string | number }
    "seller.coupon.rule.rate.noThresholdCapped": { rate: string | number; cap: string | number }
    "seller.coupon.rule.rate.threshold": { threshold: string | number; rate: string | number }
    "seller.coupon.rule.rate.thresholdCapped": { threshold: string | number; rate: string | number; cap: string | number }
    "seller.coupon.rule.reduction.noThreshold": { discount: string | number }
    "seller.coupon.rule.reduction.threshold": { threshold: string | number; discount: string | number }
    "seller.order.list.items.total": { count: string | number }
    "seller.order.refund.items.total": { count: string | number }
    "seller.product.attrs.maxReached": { max: string | number }
    "seller.product.category.result.count": { count: string | number }
    "seller.product.category.result.emptyTitle": { keyword: string | number }
    "seller.product.editSku.price.aria": { label: string | number }
    "seller.product.editSku.skuCode.aria": { label: string | number }
    "seller.product.editSku.skuCode.placeholder": { max: string | number }
    "seller.product.editSku.stock.aria": { label: string | number }
    "seller.product.editTitle.subtitle.placeholder": { min: string | number; max: string | number }
    "seller.product.info.subtitle.hint": { min: string | number; max: string | number }
    "seller.product.list.confirm.offShelf.body": { name: string | number }
    "seller.product.list.sort.aria": { label: string | number; dir: "asc" | "desc" | "other" }
    "seller.product.sales.stock.count": { count: string | number }
    "seller.review.list.stars.aria": { value: number }
    "seller.review.reply.dialog.subject": { product: string | number; buyer: string | number }
    "seller.shipping.err.duplicateRegion": { prefix: string | number }
    "seller.shipping.err.excludedConflict": { prefix: string | number }
    "seller.shipping.err.regionMissing": { index: string | number }
    "seller.shipping.region.itemTitle": { index: string | number }
    "seller.shipping.regionPicker.selectedCount": { count: string | number }
    "seller.shop.address.delete.confirm.desc": { name: string | number }
    "seller.shop.card.createdAt": { date: string | number }
    "seller.shop.invite.body": { shopName: string | number }
    "seller.shop.member.subtitle": { name: string | number }
    "seller.shop.resubmit.rejectReason": { reason: string | number }
}

export type SellerParamsOf<K extends SellerMessageKey> = K extends keyof SellerParamsByKey
    ? SellerParamsByKey[K]
    : undefined

/**
 * 本端调用侧的 `t` 形状：key 收在「本端 catalog ∪ app-kit 共享 catalog」，参数按各自的
 * `ParamsOf` 推。无参消息的参数位是 `undefined`，多塞一个就是编译错误。
 * 带参消息使用必需参数元组，漏传参数在编译时失败。
 * ICU 类型由 codegen 生成；运行时交给 i18next-icu。
 * 这是 §5.5 分工表里唯一那条「编译期」保证在三端兑现的地方。
 */
export type SellerTranslate = <K extends SellerMessageKey | AppKitMessageKey>(
    key: K,
    ...args: (K extends SellerMessageKey ? SellerParamsOf<K> : AppKitParamsOf<Extract<K, AppKitMessageKey>>) extends undefined
        ? [] : [params: K extends SellerMessageKey ? SellerParamsOf<K> : AppKitParamsOf<Extract<K, AppKitMessageKey>>]
) => string

/**
 * 按 namespace 收窄的 `t`：`useT("nav")` 拿它。key 位只收那一个 namespace 的 key，
 * 所以打错 key 的报错只列本 namespace 的候选，而不是整份联合。
 * 要 app-kit 的共享文案（`appKit.*` / `error.*`）就用不传 namespace 的整份 `t`。
 */
export type SellerScopedT<N extends keyof SellerNamespace> = <K extends SellerNamespace[N]>(
    key: K,
    ...args: SellerParamsOf<K> extends undefined ? [] : [params: SellerParamsOf<K>]
) => string

/** 一种语言里 SellerMessageKey 的每一个都得有一句 */
export type SellerCatalog = { [K in SellerMessageKey]: string }
