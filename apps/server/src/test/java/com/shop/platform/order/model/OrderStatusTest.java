package com.shop.platform.order.model;

import static com.shop.platform.order.model.OrderAvailableAction.CANCEL;
import static com.shop.platform.order.model.OrderAvailableAction.RECEIVE;
import static com.shop.platform.order.model.OrderAvailableAction.SHIP;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * 子订单履约状态机规则表测试：待发货 → 部分发货 → 已发货 → 已完成；旁支 已取消。
 * 支付不在这张表里——未付款由主订单状态表达，子订单创建即待发货。
 *
 * <p>sourcesOf 是条件更新的合法前置集；买家/卖家动作集供前端按钮渲染。
 */
class OrderStatusTest {

    /**
     * 待发货是创建态，但<b>也能被回退到达</b>：取消已发出的包裹会把有效发货量退回去，
     * 全部行结清量归零后重算回待发货（§8 履约态允许回退）。
     */
    @Test
    void 待发货是创建态_但取消已发出包裹会回退到它() {
        assertThat(OrderStatus.sourcesOf(OrderStatus.PAID))
                .containsExactlyInAnyOrder(OrderStatus.PARTIALLY_SHIPPED, OrderStatus.SHIPPED);
    }

    @Test
    void 部分发货可由待发货_自环或已发货回退到达() {
        assertThat(OrderStatus.sourcesOf(OrderStatus.PARTIALLY_SHIPPED))
                .containsExactlyInAnyOrder(OrderStatus.PAID, OrderStatus.PARTIALLY_SHIPPED, OrderStatus.SHIPPED);
    }

    @Test
    void 已发货可由待发货_部分发货或追加包裹到达() {
        assertThat(OrderStatus.sourcesOf(OrderStatus.SHIPPED))
                .containsExactlyInAnyOrder(OrderStatus.PAID, OrderStatus.PARTIALLY_SHIPPED, OrderStatus.SHIPPED);
    }

    @Test
    void 已完成只能从已发货到达_部分发货要先结清转已发货() {
        assertThat(OrderStatus.sourcesOf(OrderStatus.COMPLETED)).containsExactly(OrderStatus.SHIPPED);
    }

    @Test
    void 只有待发货可取消_且有自环的部分发货不可取消() {
        assertThat(OrderStatus.sourcesOf(OrderStatus.CANCELLED)).containsExactly(OrderStatus.PAID);
    }

    @Test
    void 买家在待发货可取消_已发货可确认收货() {
        assertThat(OrderStatus.PAID.buyerActions()).containsExactly(CANCEL);
        assertThat(OrderStatus.SHIPPED.buyerActions()).containsExactly(RECEIVE);
        assertThat(OrderStatus.PARTIALLY_SHIPPED.buyerActions()).isEmpty();
    }

    @Test
    void 终态对买家没有任何动作() {
        assertThat(OrderStatus.COMPLETED.buyerActions()).isEmpty();
        assertThat(OrderStatus.CANCELLED.buyerActions()).isEmpty();
    }

    @Test
    void 待发货到已发货都对卖家开放发货动作_终态没有() {
        assertThat(OrderStatus.PAID.sellerActions()).containsExactly(SHIP);
        assertThat(OrderStatus.PARTIALLY_SHIPPED.sellerActions()).containsExactly(SHIP);
        assertThat(OrderStatus.SHIPPED.sellerActions()).containsExactly(SHIP);
        assertThat(OrderStatus.COMPLETED.sellerActions()).isEmpty();
        assertThat(OrderStatus.CANCELLED.sellerActions()).isEmpty();
    }
}
