/**
 * Payment 模块 —— 支付流水与收银台。V1 为 MOCK 渠道的两段式状态机：发起（PENDING）→ 确认（SUCCESS/FAILED）。
 *
 * <p>schema: payment。订单前置校验走 order :: api 的 OrderReadQuery 只读点查，不 import order 内部类型；
 * 支付确认经 order :: api 的 OrderCommand.markPaid 同步同事务调用推进订单状态机，两侧原子生效。
 *
 * <p><b>V1 的「确认」是买家自己调的端点，不是回调</b>：闸门只有买家 JWT 加流水归属，没有任何渠道凭据参与，
 * 所以它是收银台的便利设施而非资金证明。接真实网关后支付结果的入口换成「匿名路由 + 报文验签 + 按渠道凭据
 * 定位流水」的回调，买家自助确认那条路必须关闭——状态机与事务口径平移，入口身份不平移
 * （细则见 {@code PaymentController} 类注释与 PAY-33）。
 *
 * <p>退款方向相反，由事件驱动：order :: events 的 OrderCancelledEvent（已付款单取消）与 aftersale :: events
 * 的 AfterSaleRefundedEvent（售后退款）各自同步同事务监听，先经 {@code payment.gateway.PaymentGateway}
 * 提交真实渠道、受理后再置 REFUNDED。V1 由 MOCK 实现支撑（受理即完成）。
 * 「接真实网关只是换一个实现」这句话在两个方向上都不成立：支付结果方向换的是入口身份（上一段），
 * 退款方向换实现之外还要把监听时机从同步改成 AFTER_COMMIT + outbox
 * （{@code kernel.event_publication} 登记表与重投任务已备，见 apps/server/AGENTS.md 的诚实边界）。
 */
@ApplicationModule(
        displayName = "Payment",
        allowedDependencies = {"order :: api", "order :: events", "aftersale :: events"})
package com.shop.platform.payment;

import org.springframework.modulith.ApplicationModule;
