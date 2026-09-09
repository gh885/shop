package com.shop.platform.order.events;

import java.util.List;
import java.util.UUID;

/**
 * 下单成功事件：一次结算（可能按店拆多单）成功后在下单事务内发布一次，携带买家与本次成交的 SKU 集合。
 * cart 同步监听按 userId + skuId 删除自己的条目——订单在，条目必不在；立即购买同样发布，
 * 买家已买下该 SKU，车里同款条目一并清掉。
 *
 * <p>事件归生产方 order 所有：cart 单向依赖 order :: events，order 不再认识购物车（无 cart :: api）。
 */
public record OrderPlacedEvent(UUID userId, List<UUID> skuIds) {}
