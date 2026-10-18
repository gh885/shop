/**
 * Payment 模块对外命名接口：退款提交（{@code PaymentRefundCommand}）。
 *
 * <p>aftersale 的退款单确认成功时经这里把钱交回渠道——退款单的聚合与状态机在 aftersale，渠道交互与
 * 支付流水已退额在本模块，方向是 aftersale → payment :: api（payment 不再监听 aftersale 的事件）。
 */
@org.springframework.modulith.NamedInterface("api")
package com.shop.platform.payment.api;
