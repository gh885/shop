// 生成物，别手改：pnpm i18n:gen（判据与清单见 scripts/contracts/i18n-codegen.mjs、docs/conventions/i18n.md）
// 来源：apps/web/src/locales/{en-US, zh-Hans-CN}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致、没有译文照抄源语言。这条保证属于生成期，手改这份文件不会让它成立。

import type { AppKitMessageKey, AppKitParamsOf } from "@shop/app-kit/i18n"

/** namespace `account`：47 条。收窄入口 `WebScopedT<"account">` */
export type AccountKeys =
    "account.profile.toast.updated" |
    "account.profile.toast.updateFailed" |
    "account.deletion.toast.cancelled" |
    "account.deletion.toast.cancelFailed" |
    "account.deletion.toast.requested" |
    "account.deletion.title" |
    "account.deletion.description" |
    "account.deletion.codeLabel" |
    "account.deletion.sendCode" |
    "account.deletion.resend" |
    "account.deletion.submit" |
    "account.deletion.disposition.lost.title" |
    "account.deletion.disposition.lost.items" |
    "account.deletion.disposition.kept.title" |
    "account.deletion.disposition.kept.items" |
    "account.deletion.disposition.legal.title" |
    "account.deletion.disposition.legal.items" |
    "account.deletion.card.descriptionRequested" |
    "account.deletion.card.descriptionIdle" |
    "account.deletion.card.effectiveWithTime" |
    "account.deletion.card.effectiveWithoutTime" |
    "account.deletion.card.pendingHint" |
    "account.deletion.cancel.confirmTitle" |
    "account.deletion.cancel.confirmDescription" |
    "account.deletion.cancel.confirmAction" |
    "account.deletion.cancel.action" |
    "account.menu.orders" |
    "account.menu.coupons" |
    "account.menu.address" |
    "account.menu.favorites" |
    "account.menu.profile" |
    "account.menu.security" |
    "account.layout.navAria" |
    "account.empty.browse" |
    "account.address.add" |
    "account.address.deleteTitle" |
    "account.address.deleteConfirm" |
    "account.address.delete" |
    "account.orders.emptyAll" |
    "account.orders.emptyDescription" |
    "account.profile.avatarFallback" |
    "account.profile.nicknameUnset" |
    "account.profile.nickname" |
    "account.profile.nicknamePlaceholder" |
    "account.profile.save" |
    "account.profile.note" |
    "account.pageTitle"

/** namespace `address`：46 条。收窄入口 `WebScopedT<"address">` */
export type AddressKeys =
    "address.err.regionRequired" |
    "address.toast.created" |
    "address.toast.createFailed" |
    "address.toast.updated" |
    "address.toast.updateFailed" |
    "address.toast.deleted" |
    "address.toast.deleteFailed" |
    "address.toast.setDefault" |
    "address.toast.setDefaultFailed" |
    "address.toast.unsetDefault" |
    "address.toast.unsetDefaultFailed" |
    "address.recognize.regionMissing" |
    "address.recognize.failed" |
    "address.field.detail" |
    "address.form.editTitle" |
    "address.form.addTitle" |
    "address.form.smartPaste" |
    "address.form.smartPastePlaceholder" |
    "address.form.parseAndFill" |
    "address.form.detailPlaceholder" |
    "address.form.receiverLabel" |
    "address.form.receiverPlaceholder" |
    "address.form.phoneLabel" |
    "address.form.phonePlaceholder" |
    "address.form.setDefaultLabel" |
    "address.form.labelTitle" |
    "address.form.customToggle" |
    "address.form.customLabelAria" |
    "address.form.customLabelPlaceholder" |
    "address.form.save" |
    "address.table.receiver" |
    "address.table.phone" |
    "address.table.region" |
    "address.table.actions" |
    "address.table.emptyTitle" |
    "address.table.emptyDescription" |
    "address.table.defaultBadge" |
    "address.table.edit" |
    "address.table.delete" |
    "address.table.unsetDefault" |
    "address.table.setDefault" |
    "address.tag.HOME" |
    "address.tag.WORK" |
    "address.tag.SCHOOL" |
    "address.tag.PARENTS" |
    "address.tag.FRIEND"

/** namespace `app`：2 条。收窄入口 `WebScopedT<"app">` */
export type AppKeys =
    "app.title" |
    "app.description"

/** namespace `cart`：42 条。收窄入口 `WebScopedT<"cart">` */
export type CartKeys =
    "cart.toolbar.selectAll" |
    "cart.toolbar.moveToFavorites" |
    "cart.toolbar.remove" |
    "cart.toolbar.category" |
    "cart.toolbar.status" |
    "cart.toolbar.searchPlaceholder" |
    "cart.toolbar.confirmRemove.title" |
    "cart.toolbar.confirmRemove.description" |
    "cart.toolbar.confirmRemove.confirm" |
    "cart.toolbar.soon.favorites" |
    "cart.toolbar.soon.category" |
    "cart.toolbar.soon.status" |
    "cart.toolbar.soon.search" |
    "cart.toast.added" |
    "cart.toast.addFailed" |
    "cart.toast.updateQtyFailed" |
    "cart.toast.toggleFailed" |
    "cart.toast.removeFailed" |
    "cart.toast.maxStock" |
    "cart.page.title" |
    "cart.empty.title" |
    "cart.empty.description" |
    "cart.empty.action" |
    "cart.group.deletedShop" |
    "cart.group.selectAllShop" |
    "cart.item.deletedTitle" |
    "cart.item.selectAria" |
    "cart.item.outOfStock" |
    "cart.item.decreaseQty" |
    "cart.item.increaseQty" |
    "cart.item.moveToFavorites" |
    "cart.item.remove" |
    "cart.item.confirmRemove.title" |
    "cart.item.confirmRemove.description" |
    "cart.item.confirmRemove.confirm" |
    "cart.settlement.title" |
    "cart.settlement.deselectAria" |
    "cart.settlement.deselect" |
    "cart.settlement.subtotal" |
    "cart.settlement.total" |
    "cart.settlement.checkout" |
    "cart.settlement.checkoutWithCount"

/** namespace `checkout`：23 条。收窄入口 `WebScopedT<"checkout">` */
export type CheckoutKeys =
    "checkout.loadFailed" |
    "checkout.retry" |
    "checkout.title" |
    "checkout.backToCart" |
    "checkout.buyerMessage.title" |
    "checkout.buyerMessage.placeholder" |
    "checkout.summary.title" |
    "checkout.placeOrder" |
    "checkout.summary.goodsTotal" |
    "checkout.summary.shipping" |
    "checkout.summary.discount" |
    "checkout.summary.payableLabel" |
    "checkout.summary.shopSuffix" |
    "checkout.address.title" |
    "checkout.address.empty.title" |
    "checkout.address.empty.body" |
    "checkout.address.empty.cta" |
    "checkout.toast.pickAddress" |
    "checkout.toast.orderPlaced" |
    "checkout.toast.orderFailed" |
    "checkout.toast.paySuccess" |
    "checkout.toast.payConfirmFailed" |
    "checkout.invalidItems"

/** namespace `common`：8 条。收窄入口 `WebScopedT<"common">` */
export type CommonKeys =
    "common.notFound.title" |
    "common.notFound.description" |
    "common.action.backHome" |
    "common.loadFailed.recommend" |
    "common.loadFailed.profile" |
    "common.a11y.home" |
    "common.a11y.backToTop" |
    "common.loadMore"

/** namespace `favorite`：21 条。收窄入口 `WebScopedT<"favorite">` */
export type FavoriteKeys =
    "favorite.title" |
    "favorite.totalCount" |
    "favorite.remove" |
    "favorite.delete" |
    "favorite.exitManage" |
    "favorite.batchManage" |
    "favorite.searchPlaceholder" |
    "favorite.searchAria" |
    "favorite.selectAllAria" |
    "favorite.selectedCount" |
    "favorite.unfavorite" |
    "favorite.confirmRemoveDesc" |
    "favorite.confirmRemove" |
    "favorite.emptyTitle" |
    "favorite.noMatchTitle" |
    "favorite.emptyDesc" |
    "favorite.noMatchDesc" |
    "favorite.browse" |
    "favorite.clearSearch" |
    "favorite.toast.removeFailed" |
    "favorite.toast.toggleFailed"

/** namespace `footer`：7 条。收窄入口 `WebScopedT<"footer">` */
export type FooterKeys =
    "footer.brand" |
    "footer.tagline" |
    "footer.group.shopping" |
    "footer.group.selling" |
    "footer.home" |
    "footer.openShop" |
    "footer.sellerCenter"

/** namespace `header`：5 条。收窄入口 `WebScopedT<"header">` */
export type HeaderKeys =
    "header.region" |
    "header.cart" |
    "header.login" |
    "header.account" |
    "header.logout"

/** namespace `home`：4 条。收窄入口 `WebScopedT<"home">` */
export type HomeKeys =
    "home.retry" |
    "home.categoryNav.ariaLabel" |
    "home.categoryNav.comingSoon" |
    "home.feed.loadFailed"

/** namespace `login`：10 条。收窄入口 `WebScopedT<"login">` */
export type LoginKeys =
    "login.title" |
    "login.close" |
    "login.qrTitle" |
    "login.qrComing" |
    "login.qrHint" |
    "login.autoRegister" |
    "login.agreementPrefix" |
    "login.userAgreement" |
    "login.and" |
    "login.privacy"

/** namespace `nav`：30 条。收窄入口 `WebScopedT<"nav">` */
export type NavKeys =
    "nav.home" |
    "nav.category" |
    "nav.apparel" |
    "nav.women" |
    "nav.men" |
    "nav.shoes" |
    "nav.bags" |
    "nav.digital" |
    "nav.phones" |
    "nav.computers" |
    "nav.appliances" |
    "nav.beauty" |
    "nav.skincare" |
    "nav.makeup" |
    "nav.personalCare" |
    "nav.homeCategory" |
    "nav.furniture" |
    "nav.textiles" |
    "nav.kitchen" |
    "nav.food" |
    "nav.snacks" |
    "nav.fresh" |
    "nav.drinks" |
    "nav.baby" |
    "nav.formula" |
    "nav.diapers" |
    "nav.toys" |
    "nav.sell" |
    "nav.openShop" |
    "nav.sellerCenter"

/** namespace `order`：110 条。收窄入口 `WebScopedT<"order">` */
export type OrderKeys =
    "order.countdown.payRemaining" |
    "order.countdown.autoConfirmAfter" |
    "order.tab.all" |
    "order.mainProgress.pending_payment" |
    "order.mainProgress.closed" |
    "order.mainProgressHint.pending_payment" |
    "order.mainProgressHint.closed" |
    "order.progress.ordered" |
    "order.progress.paid" |
    "order.progress.shipped" |
    "order.progress.received" |
    "order.itemAction.add_cart" |
    "order.itemAction.after_sale" |
    "order.field.status" |
    "order.toast.cancelled" |
    "order.toast.cancelFailed" |
    "order.toast.received" |
    "order.toast.receiveFailed" |
    "order.soon.action" |
    "order.afterSale.type.REFUND_ONLY" |
    "order.afterSale.type.RETURN_REFUND" |
    "order.afterSale.typeHint.REFUND_ONLY" |
    "order.afterSale.typeHint.RETURN_REFUND" |
    "order.afterSale.reason.NOT_AS_DESCRIBED" |
    "order.afterSale.reason.WRONG_ITEM" |
    "order.afterSale.reason.OTHER" |
    "order.afterSale.action.cancel" |
    "order.afterSale.action.return" |
    "order.afterSale.action.reapply" |
    "order.afterSale.reasonUnset" |
    "order.afterSale.toast.applied" |
    "order.afterSale.toast.applyFailed" |
    "order.afterSale.toast.cancelled" |
    "order.afterSale.toast.cancelFailed" |
    "order.afterSale.toast.returnSubmitted" |
    "order.afterSale.toast.returnSubmitFailed" |
    "order.afterSale.apply.description" |
    "order.afterSale.apply.typeLabel" |
    "order.afterSale.apply.linesLabel" |
    "order.afterSale.apply.lineRefundable" |
    "order.afterSale.apply.quantityOf" |
    "order.afterSale.apply.linesRequired" |
    "order.afterSale.apply.reasonHint" |
    "order.afterSale.apply.notePlaceholder" |
    "order.afterSale.apply.submitLabel" |
    "order.afterSale.return.description" |
    "order.afterSale.return.carrierLabel" |
    "order.afterSale.return.carrierPlaceholder" |
    "order.afterSale.return.trackingPlaceholder" |
    "order.afterSale.return.submitLabel" |
    "order.afterSale.cancelConfirm.title" |
    "order.afterSale.cancelConfirm.description" |
    "order.afterSale.card.title" |
    "order.afterSale.card.refundAmount" |
    "order.afterSale.card.lines" |
    "order.afterSale.card.reason" |
    "order.afterSale.card.note" |
    "order.afterSale.card.appliedAt" |
    "order.err.reasonRequired" |
    "order.summary.payment.title" |
    "order.summary.payment.goodsTotal" |
    "order.summary.payment.paid" |
    "order.summary.info.title" |
    "order.summary.info.orderNo" |
    "order.summary.info.copyOrderNo" |
    "order.summary.info.receiver" |
    "order.summary.info.createdAt" |
    "order.summary.info.trackingNo" |
    "order.cancel.description" |
    "order.cancel.dismissLabel" |
    "order.cancel.submitLabel" |
    "order.shop.badge" |
    "order.shop.snapshot" |
    "order.mainProgress.paid" |
    "order.mainProgress.partially_refunded" |
    "order.mainProgress.refunded" |
    "order.mainProgress.cancelled" |
    "order.mainProgressHint.paid" |
    "order.mainProgressHint.partially_refunded" |
    "order.mainProgressHint.refunded" |
    "order.mainProgressHint.cancelled" |
    "order.afterSale.type.EXCHANGE" |
    "order.afterSale.typeHint.EXCHANGE" |
    "order.afterSale.reason.QUALITY" |
    "order.afterSale.reason.MISSING_PART" |
    "order.afterSale.reason.NO_LONGER_WANTED" |
    "order.afterSale.reason.WRONG_SIZE" |
    "order.afterSale.status.APPLIED" |
    "order.afterSale.status.APPROVED" |
    "order.afterSale.status.REJECTED" |
    "order.afterSale.status.CANCELLED" |
    "order.afterSale.status.SHIPPING_BACK" |
    "order.afterSale.status.RECEIVED" |
    "order.afterSale.status.REFUNDING" |
    "order.afterSale.status.RESHIPPING" |
    "order.afterSale.status.COMPLETED" |
    "order.afterSale.status.DISPUTED" |
    "order.afterSale.card.quantity" |
    "order.card.placedAt" |
    "order.card.tradeNo" |
    "order.card.remaining" |
    "order.card.amount" |
    "order.card.detail" |
    "order.tabEmpty" |
    "order.action.pay" |
    "order.action.cancel" |
    "order.action.logistics" |
    "order.action.confirm" |
    "order.action.rebuy" |
    "order.action.add_cart"

/** namespace `pay`：23 条。收窄入口 `WebScopedT<"pay">` */
export type PayKeys =
    "pay.loading.title" |
    "pay.loading.body" |
    "pay.paying.title" |
    "pay.paying.body" |
    "pay.cashier.title" |
    "pay.cashier.orderNo" |
    "pay.cashier.mockNotice" |
    "pay.cashier.confirm" |
    "pay.success.title" |
    "pay.success.body" |
    "pay.success.viewDetail" |
    "pay.failure.payFailed.title" |
    "pay.failure.payFailed.body" |
    "pay.failure.payFailed.retry" |
    "pay.failure.notEffective.title" |
    "pay.failure.notEffective.body" |
    "pay.action.backToOrders" |
    "pay.action.viewDetail" |
    "pay.return.title" |
    "pay.return.body" |
    "pay.return.confirm" |
    "pay.return.missing.title" |
    "pay.return.missing.body"

/** namespace `product`：32 条。收窄入口 `WebScopedT<"product">` */
export type ProductKeys =
    "product.soon.inShopSearch" |
    "product.stock.soldOut" |
    "product.stock.inStockGeneric" |
    "product.stock.outOfStock" |
    "product.detail.section.reviews" |
    "product.detail.section.params" |
    "product.detail.section.detail" |
    "product.detail.section.shopReco" |
    "product.detail.section.alsoViewed" |
    "product.detail.params.empty" |
    "product.detail.description.empty" |
    "product.detail.description.emptyHint" |
    "product.detail.reco.empty" |
    "product.detail.imageAlt" |
    "product.detail.searchShop" |
    "product.detail.gallery.tab" |
    "product.detail.params.tab" |
    "product.detail.params.viewAll" |
    "product.detail.params.triggerAria" |
    "product.detail.image.thumbnailAria" |
    "product.detail.image.mainAlt" |
    "product.detail.carousel.prev" |
    "product.detail.carousel.next" |
    "product.detail.favorite.add" |
    "product.detail.favorite.remove" |
    "product.detail.cta.addToCart" |
    "product.detail.cta.buyNow" |
    "product.detail.cta.pickSpec" |
    "product.detail.qty.label" |
    "product.detail.qty.decrease" |
    "product.detail.qty.increase" |
    "product.card.noQuote"

/** namespace `route`：13 条。收窄入口 `WebScopedT<"route">` */
export type RouteKeys =
    "route.title.sell" |
    "route.title.search" |
    "route.title.account" |
    "route.title.address" |
    "route.title.favorites" |
    "route.title.orders" |
    "route.title.profile" |
    "route.title.security" |
    "route.title.cart" |
    "route.title.checkout" |
    "route.title.orderDetail" |
    "route.title.cashier" |
    "route.title.productFallback"

/** namespace `security`：26 条。收窄入口 `WebScopedT<"security">` */
export type SecurityKeys =
    "security.title" |
    "security.changePassword.title" |
    "security.changePassword.description" |
    "security.changePassword.success" |
    "security.changePassword.current" |
    "security.changePassword.currentPlaceholder" |
    "security.changePassword.currentRequired" |
    "security.changePassword.next" |
    "security.changePassword.nextPlaceholder" |
    "security.changePassword.nextTooShort" |
    "security.changePassword.confirm" |
    "security.changePassword.confirmPlaceholder" |
    "security.changePassword.mismatch" |
    "security.changePassword.submit" |
    "security.devices.title" |
    "security.devices.description" |
    "security.devices.logoutOne" |
    "security.devices.logoutAll" |
    "security.devices.logoutFailed" |
    "security.devices.logoutAllAction" |
    "security.devices.logoutAllTitle" |
    "security.devices.logoutAllConfirm" |
    "security.devices.unknownIp" |
    "security.devices.logout" |
    "security.devices.empty.title" |
    "security.devices.empty.description"

/** namespace `sell`：35 条。收窄入口 `WebScopedT<"sell">` */
export type SellKeys =
    "sell.cta.openShop" |
    "sell.cta.learnFlow" |
    "sell.hero.line1" |
    "sell.hero.line2" |
    "sell.hero.body" |
    "sell.hero.imageAlt.storefront" |
    "sell.hero.imageAlt.parcels" |
    "sell.hero.imageAlt.crafts" |
    "sell.modes.title" |
    "sell.modes.tablistLabel" |
    "sell.modes.goods.label" |
    "sell.modes.goods.title" |
    "sell.modes.goods.body" |
    "sell.modes.goods.alt" |
    "sell.modes.live.label" |
    "sell.modes.live.title" |
    "sell.modes.live.body" |
    "sell.modes.live.alt" |
    "sell.modes.original.label" |
    "sell.modes.original.title" |
    "sell.modes.original.body" |
    "sell.modes.original.alt" |
    "sell.modes.factory.label" |
    "sell.modes.factory.title" |
    "sell.modes.factory.body" |
    "sell.modes.factory.alt" |
    "sell.steps.sectionTitle" |
    "sell.steps.create.title" |
    "sell.steps.create.body" |
    "sell.steps.review.title" |
    "sell.steps.review.body" |
    "sell.steps.operate.title" |
    "sell.steps.operate.body" |
    "sell.finalCta.title" |
    "sell.finalCta.body"

/** namespace `welcome`：38 条。收窄入口 `WebScopedT<"welcome">` */
export type WelcomeKeys =
    "welcome.hero.line1" |
    "welcome.hero.line2" |
    "welcome.hero.body" |
    "welcome.hero.imageAlt.market" |
    "welcome.hero.imageAlt.crafts" |
    "welcome.hero.imageAlt.fresh" |
    "welcome.cta.browse" |
    "welcome.cta.openShop" |
    "welcome.categories.title" |
    "welcome.categories.body" |
    "welcome.categories.apparel.name" |
    "welcome.categories.apparel.subs.0" |
    "welcome.categories.apparel.subs.1" |
    "welcome.categories.apparel.subs.2" |
    "welcome.categories.apparel.subs.3" |
    "welcome.categories.digital.name" |
    "welcome.categories.digital.subs.0" |
    "welcome.categories.digital.subs.1" |
    "welcome.categories.digital.subs.2" |
    "welcome.categories.beauty.name" |
    "welcome.categories.beauty.subs.0" |
    "welcome.categories.beauty.subs.1" |
    "welcome.categories.beauty.subs.2" |
    "welcome.categories.home.name" |
    "welcome.categories.home.subs.0" |
    "welcome.categories.home.subs.1" |
    "welcome.categories.home.subs.2" |
    "welcome.categories.food.name" |
    "welcome.categories.food.subs.0" |
    "welcome.categories.food.subs.1" |
    "welcome.categories.food.subs.2" |
    "welcome.categories.baby.name" |
    "welcome.categories.baby.subs.0" |
    "welcome.categories.baby.subs.1" |
    "welcome.categories.baby.subs.2" |
    "welcome.footerCta.title" |
    "welcome.footerCta.body" |
    "welcome.footerCta.cta"

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
    "favorite": FavoriteKeys
    "footer": FooterKeys
    "header": HeaderKeys
    "home": HomeKeys
    "login": LoginKeys
    "nav": NavKeys
    "order": OrderKeys
    "pay": PayKeys
    "product": ProductKeys
    "route": RouteKeys
    "security": SecurityKeys
    "sell": SellKeys
    "welcome": WelcomeKeys
}

/** 本 root 全部 key 的联合（各 `{Ns}Keys` 的并集）。铺到几千条后打字面量会很难受，
 *  所以按 namespace 收窄的入口是 `WebScopedT`——见 按资源文件收窄 key 的约定。 */
export type WebMessageKey = WebNamespace[keyof WebNamespace]

export type WebParamsByKey = {
    "account.address.deleteConfirm": { receiver: string | number }
    "account.deletion.card.effectiveWithTime": { time: string | number }
    "account.deletion.description": { days: string | number }
    "account.deletion.resend": { countdown: string | number }
    "account.deletion.toast.requested": { days: string | number }
    "account.profile.note": { max: string | number }
    "cart.group.selectAllShop": { shopName: string | number }
    "cart.item.confirmRemove.description": { title: string | number }
    "cart.item.selectAria": { title: string | number }
    "cart.settlement.checkoutWithCount": { count: string | number }
    "cart.settlement.deselectAria": { title: string | number }
    "cart.toast.maxStock": { stock: string | number }
    "cart.toolbar.confirmRemove.description": { count: string | number }
    "favorite.confirmRemoveDesc": { count: string | number }
    "favorite.selectedCount": { selectedCount: string | number }
    "favorite.totalCount": { total: string | number }
    "order.afterSale.apply.description": { orderNo: string | number }
    "order.afterSale.apply.lineRefundable": { max: string | number; amount: string | number }
    "order.afterSale.apply.quantityOf": { name: string | number }
    "order.afterSale.card.quantity": { count: string | number }
    "order.cancel.description": { orderNo: string | number }
    "order.card.placedAt": { time: string | number }
    "order.card.remaining": { time: string | number }
    "order.card.tradeNo": { tradeNo: string | number }
    "order.countdown.autoConfirmAfter": { time: string | number }
    "order.countdown.payRemaining": { time: string | number }
    "order.soon.action": { action: string | number }
    "order.tabEmpty": { status: string | number }
    "pay.cashier.orderNo": { orderNo: string | number }
    "product.detail.image.thumbnailAria": { index: string | number }
}

export type WebParamsOf<K extends WebMessageKey> = K extends keyof WebParamsByKey
    ? WebParamsByKey[K]
    : undefined

/**
 * 本端调用侧的 `t` 形状：key 收在「本端 catalog ∪ app-kit 共享 catalog」，参数按各自的
 * `ParamsOf` 推。无参消息的参数位是 `undefined`，多塞一个就是编译错误。
 * 带参消息使用必需参数元组，漏传参数在编译时失败。
 * ICU 类型由 codegen 生成；运行时交给 i18next-icu。
 * 这是 类型与资源生成规则 分工表里唯一那条「编译期」保证在三端兑现的地方。
 */
export type WebTranslate = <K extends WebMessageKey | AppKitMessageKey>(
    key: K,
    ...args: (K extends WebMessageKey ? WebParamsOf<K> : AppKitParamsOf<Extract<K, AppKitMessageKey>>) extends undefined
        ? [] : [params: K extends WebMessageKey ? WebParamsOf<K> : AppKitParamsOf<Extract<K, AppKitMessageKey>>]
) => string

/**
 * 按 namespace 收窄的 `t`：`useT("nav")` 拿它。key 位只收那一个 namespace 的 key，
 * 所以打错 key 的报错只列本 namespace 的候选，而不是整份联合。
 * 要 app-kit 的共享文案（`login.*` / `error.*`）就用不传 namespace 的整份 `t`。
 */
export type WebScopedT<N extends keyof WebNamespace> = <K extends WebNamespace[N]>(
    key: K,
    ...args: WebParamsOf<K> extends undefined ? [] : [params: WebParamsOf<K>]
) => string

/** 一种语言里 WebMessageKey 的每一个都得有一句 */
export type WebCatalog = { [K in WebMessageKey]: string }
