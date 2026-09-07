package com.shop.platform.address.events;

import java.util.UUID;

/**
 * 商家地址变更事件（通用，纯通知）：地址本体或角色变更/创建时发布。
 * 供审计日志与下游缓存失效使用；只承载变更信号，具体影响面刷新由消费方各自处理。
 */
public record AddressChangedEvent(UUID shopId, UUID addressId) {}
