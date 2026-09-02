package com.shop.platform.payment.controller;

import com.shop.platform.common.Money;
import com.shop.platform.infra.web.CurrentUser;
import com.shop.platform.payment.dto.CreatePaymentRequest;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.model.PaymentStatus;
import com.shop.platform.payment.service.PaymentService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家支付入口（V1 MOCK 渠道：两段式状态机）。
 *
 * <p>刻意独立于 /orders——收银台是 payment 模块的资产。发起创建 PENDING 流水，
 * 确认（/payments/{id}/confirm，内部 mock 回调）才推进订单状态机；接真实网关后
 * 发起改为「创建支付单 + 返回跳转参数」，确认端点替换为网关通知回调，逻辑不变。
 * 幂等：重复发起返回同一笔 PENDING/SUCCESS 流水，不报错。
 */
@Tag(name = "payments", description = "买家支付")
@RestController
@RequestMapping("/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;

    /** 发起支付：仅待付款订单可付；金额以订单为准，前端不报价。V1 创建 PENDING 流水（不动订单状态） */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentResponse createPayment(@CurrentUser UUID userId, @Valid @RequestBody CreatePaymentRequest req) {
        return PaymentResponse.from(paymentService.pay(userId, req.orderId()));
    }

    /**
     * 确认支付（内部 mock 确认端点，模拟网关回调）：PENDING → SUCCESS + 推进订单。
     * 后端返回 payment.id 后由售前/前端在此确认；接真实网关时本端点替换为网关通知回调，逻辑不变。
     */
    @PostMapping("/{id}/confirm")
    public PaymentResponse confirmPayment(@CurrentUser UUID userId, @PathVariable UUID id) {
        return PaymentResponse.from(paymentService.confirm(userId, id));
    }

    public record PaymentResponse(
            UUID id,
            UUID orderId,
            String orderNo,
            Money amount,
            String channel,
            PaymentStatus status,
            OffsetDateTime paidAt) {

        static PaymentResponse from(Payment p) {
            return new PaymentResponse(
                    p.getId(),
                    p.getOrderId(),
                    p.getOrderNo(),
                    Money.ofFen(p.getAmount(), p.getCurrency()),
                    p.getChannel(),
                    p.getStatus(),
                    p.getPaidAt());
        }
    }
}
