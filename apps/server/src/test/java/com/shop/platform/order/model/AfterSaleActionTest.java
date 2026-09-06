package com.shop.platform.order.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * 售后状态机转移表测试。关键规则：REFUNDED 有两个来源（仅退款 APPLYING、退货 RETURNING），
 * 「该不该回补库存」由知道来源的动作决定，不能由目标态反推——所以每个动作的 from/target 必须逐行锁死，
 * 混淆任一行（如把仅退款当成回补路径）就是资金/库存事故。
 */
class AfterSaleActionTest {

    @Test
    void 申请只能从售后线空闲态发起() {
        assertThat(AfterSaleAction.APPLY.from()).isEqualTo(AfterSaleStatus.NONE);
        assertThat(AfterSaleAction.APPLY.target()).isEqualTo(AfterSaleStatus.APPLYING);
        assertThat(AfterSaleAction.APPLY.actor()).isEqualTo(OrderActor.BUYER);
    }

    @Test
    void 仅退款同意即退款_APPLYING一步到REFUNDED() {
        assertThat(AfterSaleAction.REFUND.from()).isEqualTo(AfterSaleStatus.APPLYING);
        assertThat(AfterSaleAction.REFUND.target()).isEqualTo(AfterSaleStatus.REFUNDED);
        assertThat(AfterSaleAction.REFUND.actor()).isEqualTo(OrderActor.SELLER);
    }

    @Test
    void 同意退货退款是进入退货流程而非退款() {
        assertThat(AfterSaleAction.AGREE_RETURN.from()).isEqualTo(AfterSaleStatus.APPLYING);
        assertThat(AfterSaleAction.AGREE_RETURN.target()).isEqualTo(AfterSaleStatus.RETURNING);
    }

    @Test
    void 买家回寄物流单不改变售后状态() {
        assertThat(AfterSaleAction.RETURN_GOODS.from()).isEqualTo(AfterSaleStatus.RETURNING);
        assertThat(AfterSaleAction.RETURN_GOODS.target()).isEqualTo(AfterSaleStatus.RETURNING);
        assertThat(AfterSaleAction.RETURN_GOODS.actor()).isEqualTo(OrderActor.BUYER);
    }

    @Test
    void 卖家确认收货才真正退款并回补库存() {
        assertThat(AfterSaleAction.RECEIVE_RETURN.from()).isEqualTo(AfterSaleStatus.RETURNING);
        assertThat(AfterSaleAction.RECEIVE_RETURN.target()).isEqualTo(AfterSaleStatus.REFUNDED);
        assertThat(AfterSaleAction.RECEIVE_RETURN.actor()).isEqualTo(OrderActor.SELLER);
    }

    @Test
    void 拒绝与撤销都只能从申请中态离开且是终态动作() {
        for (AfterSaleAction action : new AfterSaleAction[] {AfterSaleAction.REJECT, AfterSaleAction.CLOSE}) {
            assertThat(action.from()).isEqualTo(AfterSaleStatus.APPLYING);
            assertThat(action.target()).isNotEqualTo(AfterSaleStatus.APPLYING);
        }
        assertThat(AfterSaleAction.REJECT.actor()).isEqualTo(OrderActor.SELLER);
        assertThat(AfterSaleAction.CLOSE.actor()).isEqualTo(OrderActor.BUYER);
    }

    @Test
    void 每个动作都有非空冲突文案供409返回() {
        for (AfterSaleAction action : AfterSaleAction.values()) {
            assertThat(action.conflictMessage()).isNotBlank();
        }
    }
}
