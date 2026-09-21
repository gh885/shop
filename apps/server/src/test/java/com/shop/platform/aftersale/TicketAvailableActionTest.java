package com.shop.platform.aftersale;

import static com.shop.platform.aftersale.model.TicketAvailableAction.AGREE;
import static com.shop.platform.aftersale.model.TicketAvailableAction.CANCEL;
import static com.shop.platform.aftersale.model.TicketAvailableAction.REAPPLY;
import static com.shop.platform.aftersale.model.TicketAvailableAction.RECEIVE_RETURN;
import static com.shop.platform.aftersale.model.TicketAvailableAction.REJECT;
import static com.shop.platform.aftersale.model.TicketAvailableAction.RETURN_GOODS;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.shop.platform.aftersale.model.TicketAvailableAction;
import com.shop.platform.aftersale.model.TicketStatus;
import java.util.List;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * 售后动作推导（C5b）单测：契约下发的 availableActions 是转移表（TicketAction）与角色的交集，
 * 前端只照单渲染——这里钉死「哪个状态下发哪几个动作、按什么顺序」，漂移会让按钮说谎。
 */
class TicketAvailableActionTest {

    @Nested
    class 买家视角 {

        @Test
        void 申请中_只给撤销_回寄与重新申请都还不成立() {
            assertEquals(List.of(CANCEL), TicketAvailableAction.buyerActions(TicketStatus.APPLYING, false));
        }

        @Test
        void 退货中_只给回寄填单_撤销口子已关() {
            assertEquals(List.of(RETURN_GOODS), TicketAvailableAction.buyerActions(TicketStatus.RETURNING, false));
        }

        @Test
        void 终态_重新申请资格由订单窗口算_给才出现且只出现它() {
            assertEquals(List.of(REAPPLY), TicketAvailableAction.buyerActions(TicketStatus.REJECTED, true));
            assertEquals(List.of(REAPPLY), TicketAvailableAction.buyerActions(TicketStatus.CLOSED, true));
        }

        @Test
        void 终态_窗口已过或已退款_什么都不给() {
            assertEquals(List.of(), TicketAvailableAction.buyerActions(TicketStatus.REJECTED, false));
            assertEquals(List.of(), TicketAvailableAction.buyerActions(TicketStatus.REFUNDED, true));
        }
    }

    @Nested
    class 卖家视角 {

        @Test
        void 申请中_同意与拒绝_同意是合一个按钮的类型分岔() {
            assertEquals(List.of(AGREE, REJECT), TicketAvailableAction.sellerActions(TicketStatus.APPLYING));
        }

        @Test
        void 退货中_只给确认收货() {
            assertEquals(List.of(RECEIVE_RETURN), TicketAvailableAction.sellerActions(TicketStatus.RETURNING));
        }

        @Test
        void 终态_没有任何动作() {
            for (TicketStatus status : List.of(TicketStatus.REFUNDED, TicketStatus.REJECTED, TicketStatus.CLOSED)) {
                assertEquals(List.of(), TicketAvailableAction.sellerActions(status), status.name());
            }
        }
    }

    @Test
    void 下发顺序恒定_同一数据两次请求必须给出同一份JSON() {
        // 顺序来自枚举声明序而不是集合迭代序：契约快照与前端 diff 都依赖这个
        assertEquals(List.of(AGREE, REJECT), TicketAvailableAction.sellerActions(TicketStatus.APPLYING));
    }
}
