package com.shop.platform.aftersale;

import static com.shop.platform.aftersale.model.RefundAvailableAction.AGREE;
import static com.shop.platform.aftersale.model.RefundAvailableAction.CANCEL;
import static com.shop.platform.aftersale.model.RefundAvailableAction.INTERCEPT;
import static com.shop.platform.aftersale.model.RefundAvailableAction.REAPPLY;
import static com.shop.platform.aftersale.model.RefundAvailableAction.RECEIVE_RETURN;
import static com.shop.platform.aftersale.model.RefundAvailableAction.REJECT;
import static com.shop.platform.aftersale.model.RefundAvailableAction.RETRY;
import static com.shop.platform.aftersale.model.RefundAvailableAction.RETURN_GOODS;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.shop.platform.aftersale.model.RefundAvailableAction;
import com.shop.platform.aftersale.model.RefundStatus;
import java.util.List;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * 退款动作推导单测：契约下发的 availableActions 是十态机出边 ∩ 角色，前端只照单渲染。
 *
 * <p>这里钉死「哪个状态下发哪几个动作、按什么顺序」，漂移会让按钮说谎。重新申请的资格吃订单窗口，
 * 由 service 点查后以布尔喂入——本枚举不自己判窗口。
 */
class RefundAvailableActionTest {

    @Nested
    class 买家视角 {

        @Test
        void 待处理_只给撤销() {
            assertEquals(List.of(CANCEL), RefundAvailableAction.buyerActions(RefundStatus.PENDING, false));
        }

        @Test
        void 待寄回_撤销与回寄并存_货还没离开买家() {
            assertEquals(
                    List.of(CANCEL, RETURN_GOODS),
                    RefundAvailableAction.buyerActions(RefundStatus.RETURN_PENDING, false));
        }

        @Test
        void 终态_窗口未过给重新申请_同单退部分商品后仍能再申请() {
            for (RefundStatus status : List.of(RefundStatus.REFUNDED, RefundStatus.REJECTED, RefundStatus.CANCELLED)) {
                assertEquals(List.of(REAPPLY), RefundAvailableAction.buyerActions(status, true), status.name());
            }
        }

        @Test
        void 终态_窗口已过什么都不给() {
            assertEquals(List.of(), RefundAvailableAction.buyerActions(RefundStatus.REJECTED, false));
        }

        @Test
        void 已寄回_仍可改运单号_货在途时卖家还没确认收货() {
            assertEquals(List.of(RETURN_GOODS), RefundAvailableAction.buyerActions(RefundStatus.RETURNED, false));
        }

        @Test
        void 进行中与失败_没有可申请之外的买家动作() {
            for (RefundStatus status :
                    List.of(RefundStatus.AGREED, RefundStatus.RECEIVED, RefundStatus.REFUNDING, RefundStatus.FAILED)) {
                assertEquals(List.of(), RefundAvailableAction.buyerActions(status, true), status.name());
            }
        }
    }

    @Nested
    class 卖家视角 {

        @Test
        void 待处理_同意与拒绝_同意是合一个按钮的类型分岔() {
            assertEquals(List.of(AGREE, REJECT), RefundAvailableAction.sellerActions(RefundStatus.PENDING, false));
        }

        @Test
        void 待处理_七天无理由强制单只剩同意() {
            assertEquals(List.of(AGREE), RefundAvailableAction.sellerActions(RefundStatus.PENDING, true));
        }

        @Test
        void 已寄回_确认收货在前确认拦截在后() {
            // 正常推进的动作在前、破坏性的在后：默认该走的是确认收货
            assertEquals(
                    List.of(RECEIVE_RETURN, INTERCEPT),
                    RefundAvailableAction.sellerActions(RefundStatus.RETURNED, false));
        }

        @Test
        void 失败_给人工重试_这是自动重试耗尽后的唯一出口() {
            assertEquals(List.of(RETRY), RefundAvailableAction.sellerActions(RefundStatus.FAILED, false));
        }

        @Test
        void 其余状态_卖家没有动作() {
            for (RefundStatus status : List.of(
                    RefundStatus.AGREED,
                    RefundStatus.RETURN_PENDING,
                    RefundStatus.RECEIVED,
                    RefundStatus.REFUNDING,
                    RefundStatus.REFUNDED,
                    RefundStatus.REJECTED,
                    RefundStatus.CANCELLED)) {
                assertEquals(List.of(), RefundAvailableAction.sellerActions(status, false), status.name());
            }
        }
    }

    @Test
    void 下发顺序恒定_同一数据两次请求必须给出同一份JSON() {
        assertEquals(List.of(AGREE, REJECT), RefundAvailableAction.sellerActions(RefundStatus.PENDING, false));
        assertEquals(
                List.of(RECEIVE_RETURN, INTERCEPT), RefundAvailableAction.sellerActions(RefundStatus.RETURNED, false));
    }
}
