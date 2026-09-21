package com.shop.platform.aftersale.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.EnumSet;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * 售后状态机转移表测试。转移表是 {@link TicketAction} 的唯一真相：每个动作钉死「from → target」与发起方，
 * service 的条件更新与时间线都从这一张表派生。关键规则：REFUNDED 有两个来源（仅退款 APPLYING、退货 RETURNING），
 * 「该不该回补库存」由知道来源的动作决定，不能由目标态反推——混淆任一行就是资金/库存事故。
 */
class TicketActionTest {

    @Test
    void 申请是新建单据_无前态() {
        assertThat(TicketAction.APPLY.from()).isNull();
        assertThat(TicketAction.APPLY.target()).isEqualTo(TicketStatus.APPLYING);
        assertThat(TicketAction.APPLY.actor()).isEqualTo(TicketActor.BUYER);
    }

    @Test
    void REFUNDED_多来源_手动与超时自动各自可达() {
        // 仅退款：卖家同意即 REFUNDED（货不退、无回补）；退货退款：收货确认后 REFUNDED（回补库存）；
        // 超时自动同意（C11）落 AUTO_REFUND，与手动 REFUND 同一目标态、不同 actor。
        assertThat(actionsTo(TicketStatus.REFUNDED))
                .containsExactlyInAnyOrder(TicketAction.REFUND, TicketAction.RECEIVE_RETURN, TicketAction.AUTO_REFUND);
        assertThat(TicketAction.REFUND.from()).isEqualTo(TicketStatus.APPLYING);
        assertThat(TicketAction.RECEIVE_RETURN.from()).isEqualTo(TicketStatus.RETURNING);
        assertThat(TicketAction.REFUND.actor()).isEqualTo(TicketActor.SELLER);
        assertThat(TicketAction.RECEIVE_RETURN.actor()).isEqualTo(TicketActor.SELLER);
    }

    @Test
    void 退货退款_卖家同意后进入RETURNING_暂不退款() {
        assertThat(TicketAction.AGREE_RETURN.from()).isEqualTo(TicketStatus.APPLYING);
        assertThat(TicketAction.AGREE_RETURN.target()).isEqualTo(TicketStatus.RETURNING);
    }

    @Test
    void 回寄_态不变仅记时间线() {
        assertThat(TicketAction.RETURN_GOODS.from()).isEqualTo(TicketStatus.RETURNING);
        assertThat(TicketAction.RETURN_GOODS.target()).isEqualTo(TicketStatus.RETURNING);
        assertThat(TicketAction.RETURN_GOODS.actor()).isEqualTo(TicketActor.BUYER);
    }

    @Test
    void 拒绝与撤销都只能从申请中态离开且是终态动作() {
        for (TicketAction action : new TicketAction[] {TicketAction.REJECT, TicketAction.CLOSE}) {
            assertThat(action.from()).isEqualTo(TicketStatus.APPLYING);
            assertThat(action.target().open()).isFalse();
        }
        assertThat(TicketAction.REJECT.actor()).isEqualTo(TicketActor.SELLER);
        assertThat(TicketAction.CLOSE.actor()).isEqualTo(TicketActor.BUYER);
    }

    @Test
    void 终态_无出边() {
        for (TicketStatus terminal : EnumSet.of(TicketStatus.REFUNDED, TicketStatus.REJECTED, TicketStatus.CLOSED)) {
            assertThat(terminal.open()).isFalse();
            assertThat(actionsTo(terminal)).isNotEmpty(); // 终态是可以被转入的，只是一旦进入再无转移
            assertThat(hasTransitionFrom(terminal)).isFalse();
        }
    }

    @Test
    void 每个动作都有非空冲突文案供409返回() {
        for (TicketAction action : TicketAction.values()) {
            assertThat(action.conflictMessage()).isNotBlank();
            assertThat(action.actor()).isNotNull();
        }
    }

    private static Set<TicketAction> actionsTo(TicketStatus target) {
        Set<TicketAction> result = new HashSet<>();
        for (TicketAction action : TicketAction.values()) {
            if (action.target() == target) {
                result.add(action);
            }
        }
        return result;
    }

    private static boolean hasTransitionFrom(TicketStatus from) {
        for (TicketAction action : TicketAction.values()) {
            if (action.from() == from) {
                return true;
            }
        }
        return false;
    }
}
