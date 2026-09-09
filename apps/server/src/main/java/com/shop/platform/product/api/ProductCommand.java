package com.shop.platform.product.api;

import com.shop.platform.product.mapper.ProductMapper;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 商品命令（跨模块消费）：订单完成时累加 SPU 的累计销量投影列 products.sold_count。
 *
 * <p>在调用方（order 完成事务）内同步同事务执行：销量与「已完成」一起生效或一起回滚，不需要 outbox 与重投去重。
 * 为什么不是 product 监听 order 事件：order 已依赖 product :: api（下单取 SKU 快照），product 再消费
 * order :: events 即模块级环——Modulith 的环检测不按命名接口拆分；方向只能是 order → product。
 *
 * <p>口径：只计已完成（确认收货 / 超时自动收货）订单的行项数量，待付款/取消不计，退款不回冲（V1 纯加总）。
 * 商品已不存在时影响 0 行、不报错：订单持有快照，不因商品消失而完成失败。
 */
@Component
@RequiredArgsConstructor
public class ProductCommand {

    private final ProductMapper productMapper;

    /** 按商品累加已售件数：productId → 本次成交数量（同单多 SKU 同 SPU 由调用方先合并） */
    @Transactional
    public void addSold(Map<UUID, Integer> quantityByProductId) {
        quantityByProductId.forEach(productMapper::addSoldCount);
    }
}
