package com.shop.platform.order;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.order.model.AfterSaleAction;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.OrderAction;
import com.shop.platform.order.model.OrderActor;
import java.util.EnumSet;
import org.junit.jupiter.api.Test;

/**
 * 售后状态机单测。转移表是 {@link AfterSaleAction} 的唯一真相：每个动作钉死「from → target」、
 * 审计动作与发起方，service 的条件更新与审计流水都从这一张表派生——漂移即前后端契约破裂。
 */
class AfterSaleActionTest {

    @Test
    void REFUNDED_双来源_仅退款与退货退款各自可达() {
        // 仅退款：卖家同意即 REFUNDED（货不退、无回补）；退货退款：收货确认后 REFUNDED（回补库存）。
        // 目标态相同、副作用不同——这正是「转移表必须知道来源」的原因，不能像主状态机那样靠目标态反推。
        assertThat(actionsTo(AfterSaleStatus.REFUNDED))
                .containsExactlyInAnyOrder(AfterSaleAction.REFUND, AfterSaleAction.RECEIVE_RETURN);
        assertThat(AfterSaleAction.REFUND.from()).isEqualTo(AfterSaleStatus.APPLYING);
        assertThat(AfterSaleAction.RECEIVE_RETURN.from()).isEqualTo(AfterSaleStatus.RETURNING);
    }

    @Test
    void 退货退款_卖家同意后进入RETURNING_暂不退款() {
        assertThat(AfterSaleAction.AGREE_RETURN.from()).isEqualTo(AfterSaleStatus.APPLYING);
        assertThat(AfterSaleAction.AGREE_RETURN.target()).isEqualTo(AfterSaleStatus.RETURNING);
        // AGREED→RREFUNDED 由确认收货（RECEIVE_RETURN）承担，同意那步不改到 REFUNDED
        assertThat(AfterSaleAction.AGREE_RETURN.target()).isNotEqualTo(AfterSaleStatus.REFUNDED);
    }

    @Test
    void 回寄_态不变仅记动作() {
        assertThat(AfterSaleAction.RETURN_GOODS.from()).isEqualTo(AfterSaleStatus.RETURNING);
        assertThat(AfterSaleAction.RETURN_GOODS.target()).isEqualTo(AfterSaleStatus.RETURNING);
    }

    @Test
    void 终态_无出边() {
        for (AfterSaleStatus terminal :
                EnumSet.of(AfterSaleStatus.REFUNDED, AfterSaleStatus.REJECTED, AfterSaleStatus.CLOSED)) {
            assertThat(actionsTo(terminal)).isNotEmpty(); // 终态是可以被转入的，只是一旦进入再无转移
            assertThat(hasTransitionFrom(terminal)).isFalse();
        }
    }

    @Test
    void 每条转移_审计动作与发起方齐全() {
        for (AfterSaleAction action : AfterSaleAction.values()) {
            assertThat(action.auditAction()).isNotNull();
            assertThat(action.actor()).isIn(OrderActor.BUYER, OrderActor.SELLER);
            assertThat(action.conflictMessage()).isNotBlank();
            assertThat(action.auditAction()).isNotEqualTo(OrderAction.CREATE); // 售后动作不会用首动作
        }
    }

    private static java.util.Set<AfterSaleAction> actionsTo(AfterSaleStatus target) {
        java.util.Set<AfterSaleAction> result = new java.util.HashSet<>();
        for (AfterSaleAction action : AfterSaleAction.values()) {
            if (action.target() == target) {
                result.add(action);
            }
        }
        return result;
    }

    private static boolean hasTransitionFrom(AfterSaleStatus from) {
        for (AfterSaleAction action : AfterSaleAction.values()) {
            if (action.from() == from) {
                return true;
            }
        }
        return false;
    }
}
