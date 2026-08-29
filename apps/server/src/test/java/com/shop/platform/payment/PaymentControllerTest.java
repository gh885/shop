package com.shop.platform.payment;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.BusinessException;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 买家支付接口契约（V1 MOCK 两段式）：发起返回 PENDING 流水、金额以订单为准、错误码透传；
 * 确认端点转发确认逻辑。幂等重付与状态机推进见 OrderFlowIT。
 */
class PaymentControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID orderId = UUID.randomUUID();

    @Test
    void 发起支付_201_返回待确认流水() throws Exception {
        Payment p = new Payment();
        p.setId(UUID.randomUUID());
        p.setOrderId(orderId);
        p.setOrderNo("20260101120000001");
        p.setAmount(2000L);
        p.setCurrency("CNY");
        p.setChannel("MOCK");
        p.setStatus(Payment.STATUS_PENDING); // 两段式：发起只是 PENDING，未确认前 paidAt 为空
        when(paymentService.pay(userId, orderId)).thenReturn(p);

        mockMvc.perform(post("/payments")
                        .with(userAuth(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"orderId": "%s"}
                            """
                                .formatted(orderId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.orderNo").value("20260101120000001"))
                .andExpect(jsonPath("$.amount.amount").value(2000))
                .andExpect(jsonPath("$.channel").value("MOCK"))
                .andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test
    void 确认支付_返回成功流水() throws Exception {
        UUID paymentId = UUID.randomUUID();
        Payment p = new Payment();
        p.setId(paymentId);
        p.setOrderId(orderId);
        p.setOrderNo("20260101120000001");
        p.setAmount(2000L);
        p.setCurrency("CNY");
        p.setChannel("MOCK");
        p.setStatus(Payment.STATUS_SUCCESS);
        p.setPaidAt(OffsetDateTime.now());
        when(paymentService.confirm(userId, paymentId)).thenReturn(p);

        mockMvc.perform(post("/payments/{id}/confirm", paymentId).with(userAuth(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(paymentId.toString()))
                .andExpect(jsonPath("$.status").value("SUCCESS"))
                .andExpect(jsonPath("$.paidAt").isNotEmpty());
    }

    @Test
    void 支付_订单不可付_409透传错误码() throws Exception {
        when(paymentService.pay(eq(userId), eq(orderId)))
                .thenThrow(new BusinessException(409, "ORDER_NOT_PAYABLE", "订单当前状态不可支付"));

        mockMvc.perform(post("/payments")
                        .with(userAuth(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
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
