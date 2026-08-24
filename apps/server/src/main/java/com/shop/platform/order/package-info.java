/**
 * Order 模块 —— 交易主流程：结算预览、按店拆单下单、订单状态机、买卖家两侧视图。
 *
 * <p>schema: orders（复数避开 PG 保留字 order）。商品/地址快照在下单瞬间定格，之后 product 改价、
 * 用户删地址均不影响旧单。库存增减与购物车清理经事件总线委托 product / cart 模块完成，
 * 本模块不写任何他方 schema；支付结果由 payment 模块的 PaymentSucceededEvent 驱动。
 */
@ApplicationModule(displayName = "Order")
package com.shop.platform.order;

import org.springframework.modulith.ApplicationModule;
