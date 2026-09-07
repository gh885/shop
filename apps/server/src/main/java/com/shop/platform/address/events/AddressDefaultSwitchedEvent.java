package com.shop.platform.address.events;

import java.util.UUID;

/**
 * 某店铺默认发货/退货地址切换事件（纯通知）：设默认地址成功事务内发布。
 * 消费方（订单/面单/履约）据此刷新「默认发货/退货地址」引用或提示影响面。
 *
 * @param isShipDefault true=默认发货地址切换；false=默认退货地址切换
 */
public record AddressDefaultSwitchedEvent(UUID shopId, UUID addressId, boolean isShipDefault) {}
