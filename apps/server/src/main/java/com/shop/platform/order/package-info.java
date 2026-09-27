/**
 * Order 模块 —— 交易主流程：结算预览、按店拆单下单、两条状态机的流转、买卖家两侧视图。
 *
 * <p>schema: orders（复数避开 PG 保留字 order）。商品/地址快照在下单瞬间定格，之后 product 改价、
 * 用户删地址均不影响旧单。金额构成 = 商品总额 + 运费 − 券减免额（DB CHECK 钉死）：运费按收货地区与同店合计件数经
 * shop :: api 的 ShippingFeeReadQuery 报价，下单时连同所用模板一起落进 orders 的计费快照列；
 * 未配运费模板的店铺恒 0（模板上线前的存量口径）。券的可用性与减免额经 coupon :: api 的 CouponReadQuery 现算
 * （门槛基数是同店商品额，不含运费），下单经 CouponCommand.lock 同事务占用、支付时核销、取消时释放或补发，
 * 券 id 与承担方随金额一起落订单快照。库存冻结/扣实/释放经 inventory :: api 的 StockCommand 同步同事务调用，
 * 完成（确认收货/超时自动收货）经 product :: api 的 ProductCommand.addSold 同事务累加销量投影，
 * 下单入口先经 account :: api 的 UserReadQuery.isActive 账号闸门（买家状态非 ACTIVE 一律 403 USER_DISABLED 拒单）、
 * 再经 shop :: api 的 ShopReadQuery.isActive 营业闸门（本单任一家店非 ACTIVE 一律 409「店铺已停止营业」，
 * 与运费报价同用 shop :: api，不 import 对方的状态词表），
 * 下单成功发布 OrderPlacedEvent、cart 同步监听清理已购 SKU（order 不认识购物车，结算入参就是 SKU 行）；
 * 支付推进由 payment 经 order :: api 的
 * OrderCommand.markPaid 同步调用完成（同事务扣实冻结库存）。已付款单取消时发布 events 命名接口的
 * OrderCancelledEvent，payment 同步监听落退款单据（售后退款由 aftersale 自己的事件驱动）。本模块不写任何他方 schema。
 *
 * <p>履约主状态机：status：PENDING_PAYMENT → PAID → SHIPPED → COMPLETED，待付款/待发货可取消；规则收在 model 包的
 * OrderStatus，驱动收在 service 包的 OrderTransitionService，每次转移落一行 orders.order_status_log 审计流水。
 * 发货不再由本模块发起（发货是物流动作，入口归 logistics）：logistics 经 order :: api 的
 * OrderCommand.markShipped / markDelivered 同事务调用推进状态并回写物流摘要与签收投影
 * （shipped_at / receive_expire_at 只回填一次，追加包裹不得把窗口往后推），
 * 本模块因此不认识物流，也不再持有面单寄件人列（已归 shipments）。
 * 售后已独立为 aftersale 模块：订单只留 after_sale_status（最近一张售后单的状态）与 refund_amount（退款口径）两列投影，
 * 由 aftersale 经 order :: api 的 OrderCommand.syncAfterSale 写回；apply_expire_at 是订单自己的售后申请窗口。
 * 资金态归 payment（payments.status）。
 * 两条时间驱动的超时契约：待付款超时关单、
 * 已发货超时未确认自动收货（确认收货窗口由发货先铺兜底、签收后重算）。已付款（待发货）单<b>不在扫描表里</b>：
 * 超发货时限只提醒不代关单，买家的出口是自己的取消按钮（拍板见 ORD-60，售后另归 aftersale 模块）。
 * 本模块不自己算运费：模板与计费规则都属 shop，order 只提供订单侧事实（收货区码、同店合计件数
 * 与商品额）并消费报价，不复制 prefix / 默认规则 / 包邮门槛那套领域知识。
 */
@ApplicationModule(
        displayName = "Order",
        allowedDependencies = {"product :: api", "inventory :: api", "shop :: api", "account :: api", "coupon :: api"})
package com.shop.platform.order;

import org.springframework.modulith.ApplicationModule;
