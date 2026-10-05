// 生成物，别手改：pnpm i18n:gen（判据与清单见 scripts/i18n-codegen.mjs、docs/conventions/i18n.md §5.5）
// 来源：apps/web/src/locales/{zh-CN, en-US}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致。这条保证属于生成期，手改这份文件不会让它成立。

import type { AppKitMessageKey, AppKitParamsOf } from "@shop/app-kit/i18n"

/** namespace `account`：54 条。收窄入口 `WebScopedT<"account">` */
export type AccountKeys =
    "web.account.profile.toast.updated" |
    "web.account.profile.toast.updateFailed" |
    "web.account.deletion.toast.cancelled" |
    "web.account.deletion.toast.cancelFailed" |
    "web.account.deletion.toast.requested" |
    "web.account.deletion.title" |
    "web.account.deletion.description" |
    "web.account.deletion.codeLabel" |
    "web.account.deletion.sendCode" |
    "web.account.deletion.resend" |
    "web.account.deletion.submit" |
    "web.account.deletion.disposition.lost.title" |
    "web.account.deletion.disposition.lost.items" |
    "web.account.deletion.disposition.kept.title" |
    "web.account.deletion.disposition.kept.items" |
    "web.account.deletion.disposition.legal.title" |
    "web.account.deletion.disposition.legal.items" |
    "web.account.deletion.card.descriptionRequested" |
    "web.account.deletion.card.descriptionIdle" |
    "web.account.deletion.card.effectiveWithTime" |
    "web.account.deletion.card.effectiveWithoutTime" |
    "web.account.deletion.card.pendingHint" |
    "web.account.deletion.cancel.confirmTitle" |
    "web.account.deletion.cancel.confirmDescription" |
    "web.account.deletion.cancel.confirmAction" |
    "web.account.deletion.cancel.action" |
    "web.account.menu.orders" |
    "web.account.menu.coupons" |
    "web.account.menu.address" |
    "web.account.menu.favorites" |
    "web.account.menu.profile" |
    "web.account.menu.security" |
    "web.account.layout.navAria" |
    "web.account.empty.browse" |
    "web.account.address.add" |
    "web.account.address.deleteTitle" |
    "web.account.address.deleteConfirm" |
    "web.account.address.delete" |
    "web.account.coupons.emptyTitle" |
    "web.account.coupons.emptyDescription" |
    "web.account.coupons.pagination.aria" |
    "web.account.coupons.pagination.previousText" |
    "web.account.coupons.pagination.previousAria" |
    "web.account.coupons.pagination.info" |
    "web.account.coupons.pagination.nextText" |
    "web.account.coupons.pagination.nextAria" |
    "web.account.orders.emptyAll" |
    "web.account.orders.emptyDescription" |
    "web.account.profile.avatarFallback" |
    "web.account.profile.nicknameUnset" |
    "web.account.profile.nickname" |
    "web.account.profile.nicknamePlaceholder" |
    "web.account.profile.save" |
    "web.account.profile.note"

/** namespace `address`：46 条。收窄入口 `WebScopedT<"address">` */
export type AddressKeys =
    "web.address.err.regionRequired" |
    "web.address.toast.created" |
    "web.address.toast.createFailed" |
    "web.address.toast.updated" |
    "web.address.toast.updateFailed" |
    "web.address.toast.deleted" |
    "web.address.toast.deleteFailed" |
    "web.address.toast.setDefault" |
    "web.address.toast.setDefaultFailed" |
    "web.address.toast.unsetDefault" |
    "web.address.toast.unsetDefaultFailed" |
    "web.address.recognize.regionMissing" |
    "web.address.recognize.failed" |
    "web.address.field.detail" |
    "web.address.form.editTitle" |
    "web.address.form.addTitle" |
    "web.address.form.smartPaste" |
    "web.address.form.smartPastePlaceholder" |
    "web.address.form.parseAndFill" |
    "web.address.form.detailPlaceholder" |
    "web.address.form.receiverLabel" |
    "web.address.form.receiverPlaceholder" |
    "web.address.form.phoneLabel" |
    "web.address.form.phonePlaceholder" |
    "web.address.form.setDefaultLabel" |
    "web.address.form.labelTitle" |
    "web.address.form.customToggle" |
    "web.address.form.customLabelAria" |
    "web.address.form.customLabelPlaceholder" |
    "web.address.form.save" |
    "web.address.table.receiver" |
    "web.address.table.phone" |
    "web.address.table.region" |
    "web.address.table.actions" |
    "web.address.table.emptyTitle" |
    "web.address.table.emptyDescription" |
    "web.address.table.defaultBadge" |
    "web.address.table.edit" |
    "web.address.table.delete" |
    "web.address.table.unsetDefault" |
    "web.address.table.setDefault" |
    "web.address.tag.HOME" |
    "web.address.tag.WORK" |
    "web.address.tag.SCHOOL" |
    "web.address.tag.PARENTS" |
    "web.address.tag.FRIEND"

/** namespace `app`：2 条。收窄入口 `WebScopedT<"app">` */
export type AppKeys =
    "app.title" |
    "app.description"

/** namespace `cart`：42 条。收窄入口 `WebScopedT<"cart">` */
export type CartKeys =
    "web.cart.toolbar.selectAll" |
    "web.cart.toolbar.moveToFavorites" |
    "web.cart.toolbar.remove" |
    "web.cart.toolbar.category" |
    "web.cart.toolbar.status" |
    "web.cart.toolbar.searchPlaceholder" |
    "web.cart.toolbar.confirmRemove.title" |
    "web.cart.toolbar.confirmRemove.description" |
    "web.cart.toolbar.confirmRemove.confirm" |
    "web.cart.toolbar.soon.favorites" |
    "web.cart.toolbar.soon.category" |
    "web.cart.toolbar.soon.status" |
    "web.cart.toolbar.soon.search" |
    "web.cart.toast.added" |
    "web.cart.toast.addFailed" |
    "web.cart.toast.updateQtyFailed" |
    "web.cart.toast.toggleFailed" |
    "web.cart.toast.removeFailed" |
    "web.cart.toast.maxStock" |
    "web.cart.page.title" |
    "web.cart.empty.title" |
    "web.cart.empty.description" |
    "web.cart.empty.action" |
    "web.cart.group.deletedShop" |
    "web.cart.group.selectAllShop" |
    "web.cart.item.deletedTitle" |
    "web.cart.item.selectAria" |
    "web.cart.item.outOfStock" |
    "web.cart.item.decreaseQty" |
    "web.cart.item.increaseQty" |
    "web.cart.item.moveToFavorites" |
    "web.cart.item.remove" |
    "web.cart.item.confirmRemove.title" |
    "web.cart.item.confirmRemove.description" |
    "web.cart.item.confirmRemove.confirm" |
    "web.cart.settlement.title" |
    "web.cart.settlement.deselectAria" |
    "web.cart.settlement.deselect" |
    "web.cart.settlement.subtotal" |
    "web.cart.settlement.total" |
    "web.cart.settlement.checkout" |
    "web.cart.settlement.checkoutWithCount"

/** namespace `checkout`：33 条。收窄入口 `WebScopedT<"checkout">` */
export type CheckoutKeys =
    "web.checkout.loadFailed" |
    "web.checkout.retry" |
    "web.checkout.title" |
    "web.checkout.backToCart" |
    "web.checkout.buyerMessage.title" |
    "web.checkout.buyerMessage.placeholder" |
    "web.checkout.summary.title" |
    "web.checkout.summary.submit" |
    "web.checkout.summary.goodsTotal" |
    "web.checkout.summary.shipping" |
    "web.checkout.summary.discount" |
    "web.checkout.summary.payableLabel" |
    "web.checkout.summary.shopSuffix" |
    "web.checkout.summary.payable" |
    "web.checkout.coupon.title" |
    "web.checkout.coupon.selectTitle" |
    "web.checkout.coupon.availableUnused" |
    "web.checkout.coupon.noneAvailable" |
    "web.checkout.coupon.reduced" |
    "web.checkout.coupon.validUntil" |
    "web.checkout.coupon.noneOption" |
    "web.checkout.address.title" |
    "web.checkout.address.empty.title" |
    "web.checkout.address.empty.body" |
    "web.checkout.address.empty.cta" |
    "web.checkout.toast.pickAddress" |
    "web.checkout.toast.createFailed" |
    "web.checkout.toast.orderPlaced" |
    "web.checkout.toast.orderFailed" |
    "web.checkout.toast.payInitFailed" |
    "web.checkout.toast.paySuccess" |
    "web.checkout.toast.payConfirmFailed" |
    "web.checkout.invalidItems"

/** namespace `common`：11 条。收窄入口 `WebScopedT<"common">` */
export type CommonKeys =
    "common.notFound.title" |
    "common.notFound.description" |
    "common.action.backHome" |
    "common.loadFailed.feed" |
    "common.loadFailed.banners" |
    "common.loadFailed.categoryNav" |
    "common.loadFailed.shopBar" |
    "common.loadFailed.recommend" |
    "common.loadFailed.profile" |
    "web.common.a11y.home" |
    "web.common.a11y.backToTop"

/** namespace `coupon`：32 条。收窄入口 `WebScopedT<"coupon">` */
export type CouponKeys =
    "web.coupon.rule.reduction.threshold" |
    "web.coupon.rule.reduction.noThreshold" |
    "web.coupon.rule.rate.threshold" |
    "web.coupon.rule.rate.thresholdCapped" |
    "web.coupon.rule.rate.noThreshold" |
    "web.coupon.rule.rate.noThresholdCapped" |
    "web.coupon.face.rate" |
    "web.coupon.status.UNUSED" |
    "web.coupon.status.LOCKED" |
    "web.coupon.status.USED" |
    "web.coupon.status.EXPIRED" |
    "web.coupon.status.VOID" |
    "web.coupon.card.scope" |
    "web.coupon.card.viewOrder" |
    "web.coupon.reason.notEffective" |
    "web.coupon.reason.expired" |
    "web.coupon.popover.trigger" |
    "web.coupon.popover.title" |
    "web.coupon.popover.range" |
    "web.coupon.claim.claim" |
    "web.coupon.claim.claimed" |
    "web.coupon.claim.soldOut" |
    "web.coupon.claim.openAt" |
    "web.coupon.toast.claimSuccess" |
    "web.coupon.toast.alreadyClaimed" |
    "web.coupon.toast.claimFailed" |
    "web.coupon.unavailable.NOT_EFFECTIVE" |
    "web.coupon.unavailable.EXPIRED" |
    "web.coupon.unavailable.THRESHOLD_NOT_MET" |
    "web.coupon.unavailable.CURRENCY_MISMATCH" |
    "web.coupon.source.CLAIM" |
    "web.coupon.source.REFUND_RETURN"

/** namespace `favorite`：23 条。收窄入口 `WebScopedT<"favorite">` */
export type FavoriteKeys =
    "web.favorite.collected" |
    "web.favorite.title" |
    "web.favorite.deletedProduct" |
    "web.favorite.totalCount" |
    "web.favorite.remove" |
    "web.favorite.delete" |
    "web.favorite.exitManage" |
    "web.favorite.batchManage" |
    "web.favorite.searchPlaceholder" |
    "web.favorite.searchAria" |
    "web.favorite.selectAllAria" |
    "web.favorite.selectedCount" |
    "web.favorite.unfavorite" |
    "web.favorite.confirmRemoveDesc" |
    "web.favorite.confirmRemove" |
    "web.favorite.emptyTitle" |
    "web.favorite.noMatchTitle" |
    "web.favorite.emptyDesc" |
    "web.favorite.noMatchDesc" |
    "web.favorite.browse" |
    "web.favorite.clearSearch" |
    "web.favorite.toast.removeFailed" |
    "web.favorite.toast.toggleFailed"

/** namespace `footer`：7 条。收窄入口 `WebScopedT<"footer">` */
export type FooterKeys =
    "web.footer.brand" |
    "web.footer.tagline" |
    "web.footer.group.shopping" |
    "web.footer.group.selling" |
    "web.footer.home" |
    "web.footer.openShop" |
    "web.footer.sellerCenter"

/** namespace `header`：5 条。收窄入口 `WebScopedT<"header">` */
export type HeaderKeys =
    "web.header.region" |
    "web.header.cart" |
    "web.header.login" |
    "web.header.account" |
    "web.header.logout"

/** namespace `home`：30 条。收窄入口 `WebScopedT<"home">` */
export type HomeKeys =
    "web.home.retry" |
    "web.home.feed.loadFailed" |
    "web.home.feed.loadMore" |
    "web.home.feed.noMore" |
    "web.home.feed.loading" |
    "web.home.feed.emptyTitle" |
    "web.home.feed.emptyDescription" |
    "web.home.banners.hot.title" |
    "web.home.banners.hot.subtitle" |
    "web.home.banners.new.title" |
    "web.home.banners.new.subtitle" |
    "web.home.banners.deal.title" |
    "web.home.banners.deal.subtitle" |
    "web.home.categoryNav.comingSoon" |
    "web.home.categoryNav.ariaLabel" |
    "web.home.recommend.prevGroup" |
    "web.home.recommend.nextGroup" |
    "web.home.recommend.refresh" |
    "web.home.userCard.notLoggedIn" |
    "web.home.userCard.address" |
    "web.home.userCard.loginRegister" |
    "web.home.userCard.cart" |
    "web.home.userCard.pendingReceive" |
    "web.home.userCard.pendingShip" |
    "web.home.userCard.pendingPay" |
    "web.home.userCard.pendingReview" |
    "web.home.userCard.myOrders" |
    "web.home.userCard.browsingHistory" |
    "web.home.userCard.favorites" |
    "web.home.userCard.following"

/** namespace `login`：10 条。收窄入口 `WebScopedT<"login">` */
export type LoginKeys =
    "web.login.title" |
    "web.login.close" |
    "web.login.qrTitle" |
    "web.login.qrComing" |
    "web.login.qrHint" |
    "web.login.autoRegister" |
    "web.login.agreementPrefix" |
    "web.login.userAgreement" |
    "web.login.and" |
    "web.login.privacy"

/** namespace `logistics`：28 条。收窄入口 `WebScopedT<"logistics">` */
export type LogisticsKeys =
    "web.logistics.page.title" |
    "web.logistics.backToOrder" |
    "web.logistics.empty.title" |
    "web.logistics.empty.description" |
    "web.logistics.carrier.copy" |
    "web.logistics.carrier.returnTitle" |
    "web.logistics.receiver.prefix" |
    "web.logistics.timeline.empty" |
    "web.logistics.timeline.expand" |
    "web.logistics.timeline.collapse" |
    "web.logistics.status.PENDING_PICKUP" |
    "web.logistics.status.PICKED_UP" |
    "web.logistics.status.IN_TRANSIT" |
    "web.logistics.status.DELIVERING" |
    "web.logistics.status.DELIVERED" |
    "web.logistics.status.RETURNED" |
    "web.logistics.status.EXCEPTION" |
    "web.logistics.node.PICKED_UP" |
    "web.logistics.node.ARRIVED_HUB" |
    "web.logistics.node.DEPARTED_HUB" |
    "web.logistics.node.OUT_FOR_DELIVERY" |
    "web.logistics.node.DELIVERED" |
    "web.logistics.node.RETURNED" |
    "web.logistics.node.EXCEPTION" |
    "web.logistics.order.placed.label" |
    "web.logistics.order.placed.text" |
    "web.logistics.order.shipped.label" |
    "web.logistics.order.shipped.text"

/** namespace `nav`：30 条。收窄入口 `WebScopedT<"nav">` */
export type NavKeys =
    "web.nav.home" |
    "web.nav.category" |
    "web.nav.apparel" |
    "web.nav.women" |
    "web.nav.men" |
    "web.nav.shoes" |
    "web.nav.bags" |
    "web.nav.digital" |
    "web.nav.phones" |
    "web.nav.computers" |
    "web.nav.appliances" |
    "web.nav.beauty" |
    "web.nav.skincare" |
    "web.nav.makeup" |
    "web.nav.personalCare" |
    "web.nav.homeCategory" |
    "web.nav.furniture" |
    "web.nav.textiles" |
    "web.nav.kitchen" |
    "web.nav.food" |
    "web.nav.snacks" |
    "web.nav.fresh" |
    "web.nav.drinks" |
    "web.nav.baby" |
    "web.nav.formula" |
    "web.nav.diapers" |
    "web.nav.toys" |
    "web.nav.sell" |
    "web.nav.openShop" |
    "web.nav.sellerCenter"

/** namespace `order`：140 条。收窄入口 `WebScopedT<"order">` */
export type OrderKeys =
    "web.order.status.pending_payment" |
    "web.order.status.pending_shipment" |
    "web.order.status.pending_receipt" |
    "web.order.status.completed" |
    "web.order.status.cancelled" |
    "web.order.countdown.payRemaining" |
    "web.order.countdown.autoConfirmAfter" |
    "web.order.cardHint.pending_payment" |
    "web.order.cardHint.pending_shipment" |
    "web.order.cardHint.pending_receipt" |
    "web.order.cardHint.completed" |
    "web.order.cardHint.cancelled" |
    "web.order.tab.all" |
    "web.order.tabEmpty" |
    "web.order.progress.ordered" |
    "web.order.progress.paid" |
    "web.order.progress.shipped" |
    "web.order.progress.received" |
    "web.order.action.pay" |
    "web.order.action.cancel" |
    "web.order.action.logistics" |
    "web.order.action.confirm" |
    "web.order.action.extend_receive" |
    "web.order.action.rebuy" |
    "web.order.action.add_cart" |
    "web.order.action.ship" |
    "web.order.itemAction.add_cart" |
    "web.order.itemAction.after_sale" |
    "web.order.field.status" |
    "web.order.toast.cancelled" |
    "web.order.toast.cancelFailed" |
    "web.order.toast.received" |
    "web.order.toast.receiveFailed" |
    "web.order.toast.extended" |
    "web.order.toast.extendFailed" |
    "web.order.soon.action" |
    "web.order.extend.title" |
    "web.order.extend.description" |
    "web.order.extend.confirmText" |
    "web.order.afterSale.type.REFUND_ONLY" |
    "web.order.afterSale.type.RETURN_REFUND" |
    "web.order.afterSale.typeHint.REFUND_ONLY" |
    "web.order.afterSale.typeHint.RETURN_REFUND" |
    "web.order.afterSale.reason.NO_REASON" |
    "web.order.afterSale.reason.QUALITY_ISSUE" |
    "web.order.afterSale.reason.NOT_AS_DESCRIBED" |
    "web.order.afterSale.reason.DAMAGED" |
    "web.order.afterSale.reason.WRONG_ITEM" |
    "web.order.afterSale.reason.MISSING_ITEM" |
    "web.order.afterSale.reason.OTHER" |
    "web.order.afterSale.ticketStatus.APPLYING" |
    "web.order.afterSale.ticketStatus.RETURNING" |
    "web.order.afterSale.ticketStatus.REFUNDED" |
    "web.order.afterSale.ticketStatus.REJECTED" |
    "web.order.afterSale.ticketStatus.CLOSED" |
    "web.order.afterSale.action.cancel" |
    "web.order.afterSale.action.return" |
    "web.order.afterSale.action.track" |
    "web.order.afterSale.action.reapply" |
    "web.order.afterSale.reasonUnset" |
    "web.order.afterSale.toast.applied" |
    "web.order.afterSale.toast.applyFailed" |
    "web.order.afterSale.toast.cancelled" |
    "web.order.afterSale.toast.cancelFailed" |
    "web.order.afterSale.toast.returnSubmitted" |
    "web.order.afterSale.toast.returnSubmitFailed" |
    "web.order.afterSale.apply.description" |
    "web.order.afterSale.apply.typeLabel" |
    "web.order.afterSale.apply.reasonHint" |
    "web.order.afterSale.apply.notePlaceholder" |
    "web.order.afterSale.apply.submitLabel" |
    "web.order.afterSale.return.description" |
    "web.order.afterSale.return.addressLabel" |
    "web.order.afterSale.return.carrierLabel" |
    "web.order.afterSale.return.carrierPlaceholder" |
    "web.order.afterSale.return.trackingPlaceholder" |
    "web.order.afterSale.return.submitLabel" |
    "web.order.afterSale.cancelConfirm.title" |
    "web.order.afterSale.cancelConfirm.description" |
    "web.order.afterSale.card.title" |
    "web.order.afterSale.card.refundAmount" |
    "web.order.afterSale.card.reason" |
    "web.order.afterSale.card.note" |
    "web.order.afterSale.card.noteEmpty" |
    "web.order.afterSale.card.rejectReason" |
    "web.order.afterSale.card.appliedAt" |
    "web.order.afterSale.card.returnAddress" |
    "web.order.afterSale.card.returnAddressMissing" |
    "web.order.afterSale.card.refundedAt" |
    "web.order.afterSale.card.returnCarrier" |
    "web.order.afterSale.action.editReturn" |
    "web.order.afterSale.card.noReasonEnforced.label" |
    "web.order.afterSale.card.noReasonEnforced.body" |
    "web.order.err.reasonRequired" |
    "web.order.summary.payment.title" |
    "web.order.summary.payment.goodsTotal" |
    "web.order.summary.payment.shipping" |
    "web.order.summary.payment.discount" |
    "web.order.summary.payment.paid" |
    "web.order.summary.info.title" |
    "web.order.summary.info.orderNo" |
    "web.order.summary.info.copyOrderNo" |
    "web.order.summary.info.shop" |
    "web.order.summary.info.receiver" |
    "web.order.summary.info.createdAt" |
    "web.order.summary.info.paidAt" |
    "web.order.summary.info.shippedAt" |
    "web.order.summary.info.completedAt" |
    "web.order.summary.info.expandMore" |
    "web.order.summary.info.collapseMore" |
    "web.order.summary.info.carrier" |
    "web.order.summary.info.trackingNo" |
    "web.order.summary.info.buyerMessage" |
    "web.order.card.itemsCount" |
    "web.order.card.goodsTotal" |
    "web.order.card.amount" |
    "web.order.card.shopClosed" |
    "web.order.card.placedAt" |
    "web.order.card.orderNo" |
    "web.order.card.remaining" |
    "web.order.card.detail" |
    "web.order.cardItem.quantity" |
    "web.order.cardItem.unitPrice" |
    "web.order.cardItem.subtotal" |
    "web.order.cardItem.overdue" |
    "web.order.cardItem.shipBy" |
    "web.order.cancel.description" |
    "web.order.cancel.reason.noNeed" |
    "web.order.cancel.reason.wrongInfo" |
    "web.order.cancel.reasonLabel" |
    "web.order.cancel.noteLabel" |
    "web.order.cancel.noteHint" |
    "web.order.cancel.notePlaceholder" |
    "web.order.cancel.dismissLabel" |
    "web.order.cancel.submitLabel" |
    "web.order.shop.badge" |
    "web.order.shop.snapshot" |
    "web.order.review.title" |
    "web.order.review.description" |
    "web.order.review.action"

/** namespace `pay`：18 条。收窄入口 `WebScopedT<"pay">` */
export type PayKeys =
    "web.pay.loading.title" |
    "web.pay.loading.body" |
    "web.pay.paying.title" |
    "web.pay.paying.body" |
    "web.pay.cashier.title" |
    "web.pay.cashier.orderNo" |
    "web.pay.cashier.mockNotice" |
    "web.pay.cashier.confirm" |
    "web.pay.success.title" |
    "web.pay.success.body" |
    "web.pay.success.viewDetail" |
    "web.pay.failure.payFailed.title" |
    "web.pay.failure.payFailed.body" |
    "web.pay.failure.payFailed.retry" |
    "web.pay.failure.notEffective.title" |
    "web.pay.failure.notEffective.body" |
    "web.pay.action.backToOrders" |
    "web.pay.action.viewDetail"

/** namespace `product`：41 条。收窄入口 `WebScopedT<"product">` */
export type ProductKeys =
    "web.product.sold" |
    "web.product.soon.inShopSearch" |
    "web.product.soon.support" |
    "web.product.soon.shopHome" |
    "web.product.stock.inStock" |
    "web.product.stock.soldOut" |
    "web.product.stock.inStockGeneric" |
    "web.product.stock.outOfStock" |
    "web.product.detail.section.reviews" |
    "web.product.detail.section.params" |
    "web.product.detail.section.detail" |
    "web.product.detail.section.shopReco" |
    "web.product.detail.section.alsoViewed" |
    "web.product.detail.params.empty" |
    "web.product.detail.description.empty" |
    "web.product.detail.description.emptyHint" |
    "web.product.detail.reco.empty" |
    "web.product.detail.imageAlt" |
    "web.product.detail.searchShop" |
    "web.product.detail.gallery.tab" |
    "web.product.detail.params.tab" |
    "web.product.detail.params.viewAll" |
    "web.product.detail.params.triggerAria" |
    "web.product.detail.image.thumbnailAria" |
    "web.product.detail.image.mainAlt" |
    "web.product.detail.carousel.prev" |
    "web.product.detail.carousel.next" |
    "web.product.detail.favorite.add" |
    "web.product.detail.favorite.remove" |
    "web.product.detail.cta.addToCart" |
    "web.product.detail.cta.buyNow" |
    "web.product.detail.cta.pickSpec" |
    "web.product.detail.promise.shipping" |
    "web.product.detail.promise.return7d" |
    "web.product.detail.promise.noReturn7d" |
    "web.product.detail.qty.label" |
    "web.product.detail.qty.decrease" |
    "web.product.detail.qty.increase" |
    "web.product.detail.shop.service" |
    "web.product.detail.shop.enter" |
    "web.product.detail.shop.retry"

/** namespace `review`：36 条。收窄入口 `WebScopedT<"review">` */
export type ReviewKeys =
    "web.review.stars.srOnly" |
    "web.review.picker.ariaLabel" |
    "web.review.dialog.title.existing" |
    "web.review.dialog.title.new" |
    "web.review.dialog.loading" |
    "web.review.dialog.content.label" |
    "web.review.dialog.content.placeholder" |
    "web.review.dialog.hint" |
    "web.review.dialog.close" |
    "web.review.dialog.submit.pending" |
    "web.review.dialog.submit.action" |
    "web.review.dialog.append.pending" |
    "web.review.dialog.append.action" |
    "web.review.detail.submittedAt" |
    "web.review.detail.starsLabel" |
    "web.review.detail.myAppend" |
    "web.review.detail.append.label" |
    "web.review.detail.append.placeholder" |
    "web.review.detail.sellerReply" |
    "web.review.toast.submit.success" |
    "web.review.toast.submit.error" |
    "web.review.toast.append.success" |
    "web.review.toast.append.error" |
    "web.review.section.title" |
    "web.review.summary" |
    "web.review.buyer" |
    "web.review.append.badge" |
    "web.review.empty.title" |
    "web.review.empty.description" |
    "web.review.pagination.prev" |
    "web.review.pagination.next" |
    "web.review.rating.1" |
    "web.review.rating.2" |
    "web.review.rating.3" |
    "web.review.rating.4" |
    "web.review.rating.5"

/** namespace `route`：16 条。收窄入口 `WebScopedT<"route">` */
export type RouteKeys =
    "route.title.sell" |
    "route.title.search" |
    "route.title.account" |
    "route.title.address" |
    "route.title.coupons" |
    "route.title.favorites" |
    "route.title.orders" |
    "route.title.profile" |
    "route.title.security" |
    "route.title.cart" |
    "route.title.checkout" |
    "route.title.logistics" |
    "route.title.orderDetail" |
    "route.title.cashier" |
    "route.title.productFallback" |
    "web.route.title.account"

/** namespace `search`：17 条。收窄入口 `WebScopedT<"search">` */
export type SearchKeys =
    "web.search.input.placeholder" |
    "web.search.updating" |
    "web.search.summary.query" |
    "web.search.summary.inCategory" |
    "web.search.summary.all" |
    "web.search.filter.clearCategory" |
    "web.search.filter.total" |
    "web.search.filter.refreshing" |
    "web.search.empty.prompt.title" |
    "web.search.empty.prompt.body" |
    "web.search.empty.noResult.title" |
    "web.search.empty.noResult.titleNoQuery" |
    "web.search.empty.noResult.body" |
    "web.search.empty.clearKeyword" |
    "web.search.empty.removeCategory" |
    "web.search.empty.clearAll" |
    "web.search.needKeyword"

/** namespace `security`：27 条。收窄入口 `WebScopedT<"security">` */
export type SecurityKeys =
    "web.security.title" |
    "web.security.changePassword.title" |
    "web.security.changePassword.description" |
    "web.security.changePassword.success" |
    "web.security.changePassword.current" |
    "web.security.changePassword.currentPlaceholder" |
    "web.security.changePassword.currentRequired" |
    "web.security.changePassword.next" |
    "web.security.changePassword.nextPlaceholder" |
    "web.security.changePassword.nextTooShort" |
    "web.security.changePassword.confirm" |
    "web.security.changePassword.confirmPlaceholder" |
    "web.security.changePassword.mismatch" |
    "web.security.changePassword.submit" |
    "web.security.devices.title" |
    "web.security.devices.description" |
    "web.security.devices.logoutOne" |
    "web.security.devices.logoutAll" |
    "web.security.devices.logoutFailed" |
    "web.security.devices.logoutAllAction" |
    "web.security.devices.logoutAllTitle" |
    "web.security.devices.logoutAllConfirm" |
    "web.security.devices.current" |
    "web.security.devices.unknownIp" |
    "web.security.devices.logout" |
    "web.security.devices.empty.title" |
    "web.security.devices.empty.description"

/** namespace `sell`：35 条。收窄入口 `WebScopedT<"sell">` */
export type SellKeys =
    "web.sell.cta.openShop" |
    "web.sell.cta.learnFlow" |
    "web.sell.hero.line1" |
    "web.sell.hero.line2" |
    "web.sell.hero.body" |
    "web.sell.hero.imageAlt.storefront" |
    "web.sell.hero.imageAlt.parcels" |
    "web.sell.hero.imageAlt.crafts" |
    "web.sell.modes.title" |
    "web.sell.modes.tablistLabel" |
    "web.sell.modes.goods.label" |
    "web.sell.modes.goods.title" |
    "web.sell.modes.goods.body" |
    "web.sell.modes.goods.alt" |
    "web.sell.modes.live.label" |
    "web.sell.modes.live.title" |
    "web.sell.modes.live.body" |
    "web.sell.modes.live.alt" |
    "web.sell.modes.original.label" |
    "web.sell.modes.original.title" |
    "web.sell.modes.original.body" |
    "web.sell.modes.original.alt" |
    "web.sell.modes.factory.label" |
    "web.sell.modes.factory.title" |
    "web.sell.modes.factory.body" |
    "web.sell.modes.factory.alt" |
    "web.sell.steps.sectionTitle" |
    "web.sell.steps.create.title" |
    "web.sell.steps.create.body" |
    "web.sell.steps.review.title" |
    "web.sell.steps.review.body" |
    "web.sell.steps.operate.title" |
    "web.sell.steps.operate.body" |
    "web.sell.finalCta.title" |
    "web.sell.finalCta.body"

/** namespace `welcome`：38 条。收窄入口 `WebScopedT<"welcome">` */
export type WelcomeKeys =
    "web.welcome.hero.line1" |
    "web.welcome.hero.line2" |
    "web.welcome.hero.body" |
    "web.welcome.hero.imageAlt.market" |
    "web.welcome.hero.imageAlt.crafts" |
    "web.welcome.hero.imageAlt.fresh" |
    "web.welcome.cta.browse" |
    "web.welcome.cta.openShop" |
    "web.welcome.categories.title" |
    "web.welcome.categories.body" |
    "web.welcome.categories.apparel.name" |
    "web.welcome.categories.apparel.subs.0" |
    "web.welcome.categories.apparel.subs.1" |
    "web.welcome.categories.apparel.subs.2" |
    "web.welcome.categories.apparel.subs.3" |
    "web.welcome.categories.digital.name" |
    "web.welcome.categories.digital.subs.0" |
    "web.welcome.categories.digital.subs.1" |
    "web.welcome.categories.digital.subs.2" |
    "web.welcome.categories.beauty.name" |
    "web.welcome.categories.beauty.subs.0" |
    "web.welcome.categories.beauty.subs.1" |
    "web.welcome.categories.beauty.subs.2" |
    "web.welcome.categories.home.name" |
    "web.welcome.categories.home.subs.0" |
    "web.welcome.categories.home.subs.1" |
    "web.welcome.categories.home.subs.2" |
    "web.welcome.categories.food.name" |
    "web.welcome.categories.food.subs.0" |
    "web.welcome.categories.food.subs.1" |
    "web.welcome.categories.food.subs.2" |
    "web.welcome.categories.baby.name" |
    "web.welcome.categories.baby.subs.0" |
    "web.welcome.categories.baby.subs.1" |
    "web.welcome.categories.baby.subs.2" |
    "web.welcome.footerCta.title" |
    "web.welcome.footerCta.body" |
    "web.welcome.footerCta.cta"

/**
 * namespace 名 → 该 namespace 的 key 类型。「有哪些 namespace 可选」的唯一真相，
 *  也是收窄形态 `WebScopedT` 的入口。
 */
export type WebNamespace = {
    "account": AccountKeys
    "address": AddressKeys
    "app": AppKeys
    "cart": CartKeys
    "checkout": CheckoutKeys
    "common": CommonKeys
    "coupon": CouponKeys
    "favorite": FavoriteKeys
    "footer": FooterKeys
    "header": HeaderKeys
    "home": HomeKeys
    "login": LoginKeys
    "logistics": LogisticsKeys
    "nav": NavKeys
    "order": OrderKeys
    "pay": PayKeys
    "product": ProductKeys
    "review": ReviewKeys
    "route": RouteKeys
    "search": SearchKeys
    "security": SecurityKeys
    "sell": SellKeys
    "welcome": WelcomeKeys
}

/** 本 root 全部 key 的联合（各 `{Ns}Keys` 的并集）。铺到几千条后打字面量会很难受，
 *  所以按 namespace 收窄的入口是 `WebScopedT`——见 §4.2 末段。 */
export type WebMessageKey = WebNamespace[keyof WebNamespace]

export type WebParamsByKey = {
    "web.account.address.deleteConfirm": { receiver: string | number }
    "web.account.coupons.emptyTitle": { status: string | number }
    "web.account.coupons.pagination.info": { page: string | number; totalPages: string | number }
    "web.account.deletion.card.effectiveWithTime": { time: string | number }
    "web.account.deletion.description": { days: string | number }
    "web.account.deletion.resend": { countdown: string | number }
    "web.account.deletion.toast.requested": { days: string | number }
    "web.account.profile.note": { max: string | number }
    "web.cart.group.selectAllShop": { shopName: string | number }
    "web.cart.item.confirmRemove.description": { title: string | number }
    "web.cart.item.selectAria": { title: string | number }
    "web.cart.settlement.checkoutWithCount": { count: string | number }
    "web.cart.settlement.deselectAria": { title: string | number }
    "web.cart.toast.maxStock": { stock: string | number }
    "web.cart.toolbar.confirmRemove.description": { count: string | number }
    "web.checkout.coupon.availableUnused": { count: string | number }
    "web.checkout.coupon.reduced": { money: string | number }
    "web.checkout.coupon.validUntil": { date: string | number }
    "web.coupon.card.scope": { shop: string | number; from: string | number; to: string | number }
    "web.coupon.claim.openAt": { time: string | number }
    "web.coupon.face.rate": { rate: string | number }
    "web.coupon.popover.range": { from: string | number; to: string | number }
    "web.coupon.reason.notEffective": { datetime: string | number }
    "web.coupon.rule.rate.noThreshold": { rate: string | number }
    "web.coupon.rule.rate.noThresholdCapped": { rate: string | number; cap: string | number }
    "web.coupon.rule.rate.threshold": { threshold: string | number; rate: string | number }
    "web.coupon.rule.rate.thresholdCapped": { threshold: string | number; rate: string | number; cap: string | number }
    "web.coupon.rule.reduction.noThreshold": { discount: string | number }
    "web.coupon.rule.reduction.threshold": { threshold: string | number; discount: string | number }
    "web.favorite.collected": { count: string | number }
    "web.favorite.confirmRemoveDesc": { count: string | number }
    "web.favorite.selectedCount": { selectedCount: string | number }
    "web.favorite.totalCount": { total: string | number }
    "web.order.afterSale.apply.description": { orderNo: string | number }
    "web.order.cancel.description": { orderNo: string | number }
    "web.order.card.itemsCount": { quantity: string | number }
    "web.order.card.orderNo": { orderNo: string | number }
    "web.order.card.placedAt": { time: string | number }
    "web.order.card.remaining": { time: string | number }
    "web.order.cardItem.overdue": { time: string | number }
    "web.order.cardItem.quantity": { quantity: string | number }
    "web.order.cardItem.shipBy": { time: string | number }
    "web.order.countdown.autoConfirmAfter": { time: string | number }
    "web.order.countdown.payRemaining": { time: string | number }
    "web.order.soon.action": { action: string | number }
    "web.order.tabEmpty": { status: string | number }
    "web.pay.cashier.orderNo": { orderNo: string | number }
    "web.product.detail.image.thumbnailAria": { index: string | number }
    "web.product.sold": { count: string | number }
    "web.product.stock.inStock": { stock: string | number }
    "web.review.buyer": { name: string | number }
    "web.review.detail.starsLabel": { rating: string | number }
    "web.review.detail.submittedAt": { time: string | number }
    "web.review.dialog.title.new": { orderNo: string | number }
    "web.review.stars.srOnly": { rating: string | number }
    "web.review.summary": { count: string | number; rate: string | number }
    "web.search.empty.noResult.title": { query: string | number }
    "web.search.filter.total": { total: string | number }
    "web.search.summary.query": { query: string | number }
}

export type WebParamsOf<K extends WebMessageKey> = K extends keyof WebParamsByKey
    ? WebParamsByKey[K]
    : undefined

/**
 * 本端调用侧的 `t` 形状：key 收在「本端 catalog ∪ app-kit 共享 catalog」，参数按各自的
 * `ParamsOf` 推。无参消息的参数位是 `undefined`，多塞一个就是编译错误。
 * 带参消息使用必需参数元组，漏传参数在编译时失败。
 * ICU 类型由 codegen 生成；运行时交给 i18next-icu。
 * 这是 §5.5 分工表里唯一那条「编译期」保证在三端兑现的地方。
 */
export type WebTranslate = <K extends WebMessageKey | AppKitMessageKey>(
    key: K,
    ...args: (K extends WebMessageKey ? WebParamsOf<K> : AppKitParamsOf<Extract<K, AppKitMessageKey>>) extends undefined
        ? [] : [params: K extends WebMessageKey ? WebParamsOf<K> : AppKitParamsOf<Extract<K, AppKitMessageKey>>]
) => string

/**
 * 按 namespace 收窄的 `t`：`useT("nav")` 拿它。key 位只收那一个 namespace 的 key，
 * 所以打错 key 的报错只列本 namespace 的候选，而不是整份联合。
 * 要 app-kit 的共享文案（`appKit.*` / `error.*`）就用不传 namespace 的整份 `t`。
 */
export type WebScopedT<N extends keyof WebNamespace> = <K extends WebNamespace[N]>(
    key: K,
    ...args: WebParamsOf<K> extends undefined ? [] : [params: WebParamsOf<K>]
) => string

/** 一种语言里 WebMessageKey 的每一个都得有一句 */
export type WebCatalog = { [K in WebMessageKey]: string }
