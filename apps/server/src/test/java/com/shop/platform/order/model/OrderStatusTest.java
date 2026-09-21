package com.shop.platform.order.model;

import static com.shop.platform.order.model.OrderAvailableAction.CANCEL;
import static com.shop.platform.order.model.OrderAvailableAction.PAY;
import static com.shop.platform.order.model.OrderAvailableAction.RECEIVE;
import static com.shop.platform.order.model.OrderAvailableAction.SHIP;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * 订单履约主状态机规则表测试：单路径流转（待付款 → 待发货 → 已发货 → 已完成）。
 * sourcesOf 是条件更新（WHERE status IN (...)）的合法前置集；买家/卖家动作集供前端按钮渲染，
 * 出边（当前态能去哪）由动作集侧面覆盖。转移表失真 = 错态单据被放行或好单被 409 拒绝，必须锁死。
 */
class OrderStatusTest {

    // sourcesOf：条件更新的合法前置集
    @Test
    void 只有待付款能转移到已支付() {
        assertThat(OrderStatus.sourcesOf(OrderStatus.PAID)).containsExactly(OrderStatus.PENDING_PAYMENT);
    }

    @Test
    void 只有待发货能发货() {
        assertThat(OrderStatus.sourcesOf(OrderStatus.SHIPPED)).containsExactly(OrderStatus.PAID);
    }

    @Test
    void 只有已发货能确认完成() {
        assertThat(OrderStatus.sourcesOf(OrderStatus.COMPLETED)).containsExactly(OrderStatus.SHIPPED);
    }

    @Test
    void 待付款与待发货都可取消但已发货不可() {
        assertThat(OrderStatus.sourcesOf(OrderStatus.CANCELLED))
                .containsExactlyInAnyOrder(OrderStatus.PENDING_PAYMENT, OrderStatus.PAID);
    }

    @Test
    void 终态不可作为任何转移的源() {
        assertThat(OrderStatus.sourcesOf(OrderStatus.PAID))
                .doesNotContain(OrderStatus.COMPLETED, OrderStatus.CANCELLED);
        assertThat(OrderStatus.sourcesOf(OrderStatus.SHIPPED)).doesNotContain(OrderStatus.CANCELLED);
        assertThat(OrderStatus.sourcesOf(OrderStatus.COMPLETED)).doesNotContain(OrderStatus.CANCELLED);
    }

    // 买家动作集：详情页按钮组渲染
    @Test
    void 买家在待付款态可支付和取消() {
        assertThat(OrderStatus.PENDING_PAYMENT.buyerActions()).containsExactly(PAY, CANCEL);
    }

    @Test
    void 买家在待发货态只能取消() {
        assertThat(OrderStatus.PAID.buyerActions()).containsExactly(CANCEL);
    }

    @Test
    void 买家在已发货态只能确认收货() {
        assertThat(OrderStatus.SHIPPED.buyerActions()).containsExactly(RECEIVE);
    }

    @Test
    void 终态对买家没有任何动作() {
        assertThat(OrderStatus.COMPLETED.buyerActions()).isEmpty();
        assertThat(OrderStatus.CANCELLED.buyerActions()).isEmpty();
    }

    // 卖家动作集：发货作业按钮
    @Test
    void 只有待发货态对卖家开放发货动作() {
        assertThat(OrderStatus.PAID.sellerActions()).containsExactly(SHIP);
        assertThat(OrderStatus.PENDING_PAYMENT.sellerActions()).isEmpty();
        assertThat(OrderStatus.SHIPPED.sellerActions()).isEmpty();
    }
}
