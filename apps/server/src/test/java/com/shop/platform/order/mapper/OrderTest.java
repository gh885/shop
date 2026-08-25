package com.shop.platform.order.mapper;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * 订单状态机单测。TRANSITIONS 是唯一真相源：service 条件更新的源状态集（sourcesOf）、
 * 前端按钮组（buyerActions/sellerActions）都从这里派生——漂移即前后端契约破裂，值得钉死。
 */
class OrderTest {

    private Order orderOf(String status) {
        Order o = new Order();
        o.setStatus(status);
        return o;
    }

    @Test
    void 待付款_买家可支付或取消_卖家无动作() {
        assertThat(orderOf(Order.STATUS_PENDING_PAYMENT).buyerActions()).containsExactlyInAnyOrder("PAY", "CANCEL");
        assertThat(orderOf(Order.STATUS_PENDING_PAYMENT).sellerActions()).isEmpty();
    }

    @Test
    void 已付款_买家仍可取消_卖家可发货() {
        // 已付款待发货：取消回补库存是合法转移（见 OrderFlowIT），发货按钮此时亮起
        assertThat(orderOf(Order.STATUS_PAID).buyerActions()).containsExactly("CANCEL");
        assertThat(orderOf(Order.STATUS_PAID).sellerActions()).containsExactly("SHIP");
    }

    @Test
    void 已发货_买家可确认收货_卖家无动作() {
        assertThat(orderOf(Order.STATUS_SHIPPED).buyerActions()).containsExactly("RECEIVE");
        assertThat(orderOf(Order.STATUS_SHIPPED).sellerActions()).isEmpty();
    }

    @Test
    void 终态_两侧动作全空() {
        assertThat(orderOf(Order.STATUS_COMPLETED).buyerActions()).isEmpty();
        assertThat(orderOf(Order.STATUS_COMPLETED).sellerActions()).isEmpty();
        assertThat(orderOf(Order.STATUS_CANCELLED).buyerActions()).isEmpty();
        assertThat(orderOf(Order.STATUS_CANCELLED).sellerActions()).isEmpty();
    }

    @Test
    void sourcesOf_条件更新的合法前置集() {
        // 支付只接受待付款单；发货只接受已付款；收货只接受已发货
        assertThat(Order.sourcesOf(Order.STATUS_PAID)).containsExactly(Order.STATUS_PENDING_PAYMENT);
        assertThat(Order.sourcesOf(Order.STATUS_SHIPPED)).containsExactly(Order.STATUS_PAID);
        assertThat(Order.sourcesOf(Order.STATUS_COMPLETED)).containsExactly(Order.STATUS_SHIPPED);
        // 取消有两个来源态：待付款直接关、已付款退款关
        assertThat(Order.sourcesOf(Order.STATUS_CANCELLED))
                .containsExactlyInAnyOrder(Order.STATUS_PENDING_PAYMENT, Order.STATUS_PAID);
    }

    @Test
    void 全部状态集_由转移表派生_五个状态齐全() {
        assertThat(Order.ALL_STATUSES)
                .containsExactlyInAnyOrder(
                        Order.STATUS_PENDING_PAYMENT,
                        Order.STATUS_PAID,
                        Order.STATUS_SHIPPED,
                        Order.STATUS_COMPLETED,
                        Order.STATUS_CANCELLED);
    }

    @Test
    void 未知状态_不炸且无动作() {
        // 防御：脏数据状态不该让详情页渲染崩掉
        assertThat(orderOf("DIRTY_STATUS").buyerActions()).isEmpty();
    }
}
