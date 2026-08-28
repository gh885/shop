/**
 * Payment 模块 —— 支付流水与收银台。V1 为 MOCK 渠道的两段式状态机：发起（PENDING）→ 确认（SUCCESS/FAILED）；
 * 接真实网关时确认端点替换为网关通知回调、扩展渠道跳转与验签，order 只经 api 感知结果。
 *
 * <p>schema: payment。订单前置校验走 order :: api 的 OrderReadQuery 只读点查，不 import order 内部类型；
 * 支付确认经 order :: api 的 OrderCommand.markPaid 同步同事务调用推进订单状态机，两侧原子生效。
 */
@ApplicationModule(
        displayName = "Payment",
        allowedDependencies = {"order :: api"})
package com.shop.platform.payment;

import org.springframework.modulith.ApplicationModule;
