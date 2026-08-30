/**
 * Payment 模块 —— 支付流水与收银台。V1 为 MOCK 渠道的两段式状态机：发起（PENDING）→ 确认（SUCCESS/FAILED）；
 * 接真实网关时确认端点替换为网关通知回调、扩展渠道跳转与验签，order 只经 api 感知结果。
 *
 * <p>schema: payment。订单前置校验走 order :: api 的 OrderReadQuery 只读点查，不 import order 内部类型；
 * 支付确认经 order :: api 的 OrderCommand.markPaid 同步同事务调用推进订单状态机，两侧原子生效；
 * 退款方向相反，由 order :: events 驱动：OrderCancelledEvent（已付款单取消）与 OrderAfterSaleRefundedEvent
 * （售后同意退款）各自同步监听，先经 {@code payment.gateway.PaymentGateway} 提交真实渠道、受理后再置 REFUNDED。
 * V1 由 MOCK 实现支撑（受理即完成），接真实网关只换实现，模块内部逻辑不变。
 */
@ApplicationModule(
        displayName = "Payment",
        allowedDependencies = {"order :: api", "order :: events"})
package com.shop.platform.payment;

import org.springframework.modulith.ApplicationModule;
