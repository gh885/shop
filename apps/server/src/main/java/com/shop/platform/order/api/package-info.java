/**
 * Order 模块对外命名接口：跨模块只读查询（{@code OrderReadQuery}：payment 支付前置校验的支付视图、
 * aftersale 申请前置与退款口径的售后视图、回补库存用的行项）与订单命令（{@code OrderCommand.markPaid}，
 * payment 推进主状态机；{@code OrderCommand.syncAfterSale}，aftersale 写回售后投影列）。退款方向走 events，不在本包。
 * 订单状态魔法值私有在本模块（对外只给 {@code pendingPayment()} / {@code afterSaleOpenAt()} 这类谓词）。
 */
@org.springframework.modulith.NamedInterface("api")
package com.shop.platform.order.api;
