package com.shop.platform.order;

import static com.shop.platform.order.model.OrderAvailableAction.CANCEL;
import static com.shop.platform.order.model.OrderAvailableAction.PAY;
import static com.shop.platform.order.model.OrderAvailableAction.RECEIVE;
import static com.shop.platform.order.model.OrderAvailableAction.SHIP;
import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.OrderStatus;
import org.junit.jupiter.api.Test;

/**
 * 实体对状态机的转发（半充血模型：规则归枚举，实体只转交）。
 *
 * <p>转移表与动作集本身由 {@link OrderStatusTest} 锁死，这里不重复；本文件只守一件事——
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
    void 待付款_买家可支付或取消_卖家无动作() {
        assertThat(orderOf(OrderStatus.PENDING_PAYMENT).buyerActions()).containsExactly(PAY, CANCEL);
        assertThat(orderOf(OrderStatus.PENDING_PAYMENT).sellerActions()).isEmpty();
    }

    @Test
    void 已付款_买家仍可取消_卖家可发货() {
        // 已付款待发货：取消回补库存是合法转移，发货按钮此时亮起
        assertThat(orderOf(OrderStatus.PAID).buyerActions()).containsExactly(CANCEL);
        assertThat(orderOf(OrderStatus.PAID).sellerActions()).containsExactly(SHIP);
    }

    @Test
    void 已发货_买家可确认收货_卖家无动作() {
        assertThat(orderOf(OrderStatus.SHIPPED).buyerActions()).containsExactly(RECEIVE);
        assertThat(orderOf(OrderStatus.SHIPPED).sellerActions()).isEmpty();
    }

    @Test
    void 终态_两侧动作全空() {
        assertThat(orderOf(OrderStatus.COMPLETED).buyerActions()).isEmpty();
        assertThat(orderOf(OrderStatus.COMPLETED).sellerActions()).isEmpty();
        assertThat(orderOf(OrderStatus.CANCELLED).buyerActions()).isEmpty();
        assertThat(orderOf(OrderStatus.CANCELLED).sellerActions()).isEmpty();
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
