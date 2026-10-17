package com.shop.platform.payment;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.model.PaymentStatus;
import com.shop.platform.payment.service.PaymentBatchView;
import com.shop.platform.payment.service.PaymentView;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 买家支付接口契约（MOCK 两段式）。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：创建语义（201）、错误码透传（409）、鉴权守卫（401）、路由与参数绑定（verify）。
 * 两段式状态机、金额以主订单为准、幂等重付属于 service / OrderFlowIT。
 */
class PaymentControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID tradeId = UUID.randomUUID();

    private final UUID orderId = UUID.randomUUID();

    private PaymentBatchView batch() {
        Payment p = new Payment();
        p.setId(UUID.randomUUID());
        p.setTradeId(tradeId);
        p.setOrderId(orderId);
        p.setOrderNo("20260101120000001");
        p.setAmount(2000L);
        p.setCurrency("CNY");
        p.setChannel("MOCK");
        p.setStatus(PaymentStatus.PENDING);
        return new PaymentBatchView(tradeId, "T20260101120000001", Money.cny(2000), List.of(PaymentView.from(p)));
    }

    @Nested
    class 发起支付 { // POST /payments

        @Test
        void 合法tradeId_201() throws Exception {
            when(paymentService.payTrade(userId, tradeId)).thenReturn(batch());

            mockMvc.perform(post("/payments")
                            .with(userAuth(userId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(
                                    """
                                {"tradeId": "%s"}
                                """
                                            .formatted(tradeId)))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.tradeId").value(tradeId.toString()));

            verify(paymentService).payTrade(userId, tradeId);
        }

        @Test
        void 订单不可付_409透传错误码() throws Exception {
            when(paymentService.payTrade(eq(userId), eq(tradeId)))
                    .thenThrow(new BusinessException(409, "ORDER_NOT_PAYABLE", "订单当前状态不可支付"));

            mockMvc.perform(post("/payments")
                            .with(userAuth(userId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(
                                    """
                                {"tradeId": "%s"}
                                """
                                            .formatted(tradeId)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("ORDER_NOT_PAYABLE"));
        }

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(post("/payments")).andExpect(status().isUnauthorized());
        }
    }

    @Nested
    class 确认整单支付 { // POST /payments/trade/{tradeId}/confirm

        @Test
        void 确认_透传() throws Exception {
            when(paymentService.confirmTrade(userId, tradeId)).thenReturn(batch());

            mockMvc.perform(post("/payments/trade/{tradeId}/confirm", tradeId).with(userAuth(userId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.tradeId").value(tradeId.toString()));

            verify(paymentService).confirmTrade(userId, tradeId);
        }

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(post("/payments/trade/{tradeId}/confirm", UUID.randomUUID()))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Nested
    class 单条流水确认 { // POST /payments/{id}/confirm

        @Test
        void 确认_透传() throws Exception {
            UUID paymentId = UUID.randomUUID();
            Payment p = new Payment();
            p.setId(paymentId);
            p.setTradeId(tradeId);
            p.setOrderId(orderId);
            p.setOrderNo("20260101120000001");
            p.setAmount(2000L);
            p.setCurrency("CNY");
            p.setChannel("MOCK");
            p.setStatus(PaymentStatus.SUCCESS);
            p.setPaidAt(OffsetDateTime.now());
            when(paymentService.confirm(userId, paymentId)).thenReturn(p);

            mockMvc.perform(post("/payments/{id}/confirm", paymentId).with(userAuth(userId)))
                    .andExpect(status().isOk());

            verify(paymentService).confirm(userId, paymentId);
        }
    }
}
