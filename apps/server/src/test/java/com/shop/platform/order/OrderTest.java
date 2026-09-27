package com.shop.platform.order;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.OrderStatus;
import org.junit.jupiter.api.Test;

/**
 * 实体对状态机的转发（半充血模型：规则归枚举，实体只转交）。
 *
 * <p>动作集的具体内容（哪个状态给哪些按钮）由 {@link OrderStatusTest} 锁死，这里不重复；本文件只守一件事——
 * {@link Order} 上的两个动作集是<b>转发</b>而不是各自硬编码的副本，副本一旦与状态表漂移，
 * 前端按钮组会整片错乱而编译期毫无提示。
 */
class OrderTest {

    private Order orderOf(OrderStatus status) {
        Order o = new Order();
        o.setStatus(status);
        return o;
    }

    @Test
    void 每个状态的买家动作_与状态表同一集合() {
        for (OrderStatus status : OrderStatus.values()) {
            assertThat(orderOf(status).buyerActions())
                    .describedAs("%s 的买家动作集", status)
                    .containsExactlyInAnyOrderElementsOf(status.buyerActions());
        }
    }

    @Test
    void 每个状态的卖家动作_与状态表同一集合() {
        for (OrderStatus status : OrderStatus.values()) {
            assertThat(orderOf(status).sellerActions())
                    .describedAs("%s 的卖家动作集", status)
                    .containsExactlyInAnyOrderElementsOf(status.sellerActions());
        }
    }
}
