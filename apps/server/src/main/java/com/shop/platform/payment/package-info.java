/**
 * Payment 模块 —— 支付流水与收银台。V1 为 MOCK 渠道（发起即成功）；
 * 接真实网关时本模块内扩展 PENDING/FAILED 状态、渠道跳转与回调验签，order 只经 api 感知结果。
 *
 * <p>schema: payment。订单前置校验走 order :: api 的 OrderReadQuery 只读点查，不 import order 内部类型；
 * 支付成功经 order :: api 的 OrderCommand.markPaid 同步同事务调用推进订单状态机，两侧原子生效。
 */
@ApplicationModule(
        displayName = "Payment",
        allowedDependencies = {"order :: api"})
package com.shop.platform.payment;

import org.springframework.modulith.ApplicationModule;
