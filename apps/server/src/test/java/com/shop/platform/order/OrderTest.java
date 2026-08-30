package com.shop.platform.order;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.OrderStatus;
import org.junit.jupiter.api.Test;

/**
 * 订单主状态机单测。状态集与转移表是 {@link OrderStatus} 的唯一真相：
 * service 条件更新的源状态集（sourcesOf）、前端按钮组（buyerActions/sellerActions）都从这里派生——
 * 漂移即前后端契约破裂，值得钉死。
 */
class OrderTest {

    private Order orderOf(OrderStatus status) {
        Order o = new Order();
        o.setStatus(status);
        return o;
    }

    @Test
    void 待付款_买家可支付或取消_卖家无动作() {
        assertThat(orderOf(OrderStatus.PENDING_PAYMENT).buyerActions()).containsExactlyInAnyOrder("PAY", "CANCEL");
        assertThat(orderOf(OrderStatus.PENDING_PAYMENT).sellerActions()).isEmpty();
    }

    @Test
    void 已付款_买家仍可取消_卖家可发货() {
        // 已付款待发货：取消回补库存是合法转移（见 OrderFlowIT），发货按钮此时亮起
        assertThat(orderOf(OrderStatus.PAID).buyerActions()).containsExactly("CANCEL");
        assertThat(orderOf(OrderStatus.PAID).sellerActions()).containsExactly("SHIP");
    }

    @Test
    void 已发货_买家可确认收货_卖家无动作() {
        assertThat(orderOf(OrderStatus.SHIPPED).buyerActions()).containsExactly("RECEIVE");
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
    void sourcesOf_条件更新的合法前置集() {
        // 支付只接受待付款单；发货只接受已付款；收货只接受已发货
        assertThat(OrderStatus.sourcesOf(OrderStatus.PAID)).containsExactly(OrderStatus.PENDING_PAYMENT);
        assertThat(OrderStatus.sourcesOf(OrderStatus.SHIPPED)).containsExactly(OrderStatus.PAID);
        assertThat(OrderStatus.sourcesOf(OrderStatus.COMPLETED)).containsExactly(OrderStatus.SHIPPED);
        // 取消有两个来源态：待付款直接关、已付款退款关
        assertThat(OrderStatus.sourcesOf(OrderStatus.CANCELLED))
                .containsExactlyInAnyOrder(OrderStatus.PENDING_PAYMENT, OrderStatus.PAID);
    }

    @Test
    void 全部状态集_由转移表派生_五个状态齐全() {
        assertThat(OrderStatus.values())
                .containsExactlyInAnyOrder(
                        OrderStatus.PENDING_PAYMENT,
                        OrderStatus.PAID,
                        OrderStatus.SHIPPED,
                        OrderStatus.COMPLETED,
                        OrderStatus.CANCELLED);
    }
}
