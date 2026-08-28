package com.shop.platform.payment.controller;

import com.shop.platform.common.Money;
import com.shop.platform.common.UserIdHolder;
import com.shop.platform.payment.dto.CreatePaymentRequest;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.service.PaymentService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家支付入口（V1 MOCK 渠道：发起即成功）。
 *
 * <p>刻意独立于 /orders——收银台是 payment 模块的资产，接真实网关后本端点演化为
 * 「创建支付单 + 返回跳转参数」，回调走网关通知，订单侧始终只经事件感知结果。
 * 幂等：重复发起返回同一笔成功流水（200），不报错。
 */
@Tag(name = "payments", description = "买家支付")
@RestController
@RequestMapping("/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;

    /** 发起支付：仅待付款订单可付；金额以订单为准，前端不报价 */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentResponse createPayment(@Valid @RequestBody CreatePaymentRequest req) {
        return PaymentResponse.from(paymentService.pay(UserIdHolder.get(), req.orderId()));
    }

    public record PaymentResponse(
            UUID id, UUID orderId, String orderNo, Money amount, String channel, OffsetDateTime paidAt) {

        static PaymentResponse from(Payment p) {
            return new PaymentResponse(
                    p.getId(),
                    p.getOrderId(),
                    p.getOrderNo(),
                    Money.ofFen(p.getAmount(), p.getCurrency()),
                    p.getChannel(),
                    p.getPaidAt());
        }
    }
}
