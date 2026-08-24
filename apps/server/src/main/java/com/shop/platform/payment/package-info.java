/**
 * Payment 模块 —— 支付流水与收银台。V1 为 MOCK 渠道（发起即成功）；
 * 接真实网关时本模块内扩展 PENDING/FAILED 状态、渠道跳转与回调验签，order 只经事件感知结果。
 *
 * <p>schema: payment。跨 schema 只读点查 orders.orders 做下单前置校验，不 import order 模块任何类型；
 * 支付成功经 PaymentSucceededEvent 驱动订单状态机，两侧同事务原子生效。
 */
@ApplicationModule(displayName = "Payment")
package com.shop.platform.payment;

import org.springframework.modulith.ApplicationModule;
