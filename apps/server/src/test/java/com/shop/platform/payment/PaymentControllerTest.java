package com.shop.platform.payment;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.BusinessException;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.model.PaymentStatus;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 买家支付接口契约（V1 MOCK 两段式）。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：创建语义（201）、错误码透传（409）、鉴权守卫（401）、路由与参数绑定（verify）。
 * 两段式状态机、金额以订单为准、幂等重付属于 service / OrderFlowIT。
 */
class PaymentControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID orderId = UUID.randomUUID();

    @Nested
    class 发起支付 { // POST /payments

        @Test
        void 合法orderId_201() throws Exception {
            Payment p = new Payment();
            p.setId(UUID.randomUUID());
            p.setOrderId(orderId);
            p.setOrderNo("20260101120000001");
            p.setAmount(2000L);
            p.setCurrency("CNY");
            p.setChannel("MOCK");
            p.setStatus(PaymentStatus.PENDING);
            when(paymentService.pay(userId, orderId)).thenReturn(p);

            mockMvc.perform(post("/payments")
                            .with(userAuth(userId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(
                                    """
                                {"orderId": "%s"}
                                """
                                            .formatted(orderId)))
                    .andExpect(status().isCreated());

            verify(paymentService).pay(userId, orderId);
        }

        @Test
        void 订单不可付_409透传错误码() throws Exception {
            when(paymentService.pay(eq(userId), eq(orderId)))
                    .thenThrow(new BusinessException(409, "ORDER_NOT_PAYABLE", "订单当前状态不可支付"));

            mockMvc.perform(post("/payments")
                            .with(userAuth(userId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(
                                    """
                                {"orderId": "%s"}
                                """
                                            .formatted(orderId)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("ORDER_NOT_PAYABLE"));
        }

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(post("/payments")).andExpect(status().isUnauthorized());
        }
    }

    @Nested
    class 确认支付 { // POST /payments/{id}/confirm

        @Test
        void 确认_透传() throws Exception {
            UUID paymentId = UUID.randomUUID();
            Payment p = new Payment();
            p.setId(paymentId);
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
