package com.shop.platform.payment.controller;

import com.shop.platform.infra.web.CurrentUser;
import com.shop.platform.payment.dto.CreatePaymentRequest;
import com.shop.platform.payment.service.PaymentBatchView;
import com.shop.platform.payment.service.PaymentService;
import com.shop.platform.payment.service.PaymentView;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
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
 * 买家支付入口。
 *
 * <p>刻意独立于 /orders——收银台是 payment 模块的资产。一次结算 = 一张主订单：
 * 发起创建各子订单的 PENDING 流水（真实渠道同时返回 {@code payUrl}），确认才推进订单状态机。
 *
 * <p><b>确认端点的闸门按流水渠道分两种。</b>MOCK 渠道没有渠道侧凭据，「钱已付」由调用方自己声明；
 * 支付宝渠道必须由服务端向渠道 {@code queryTrade} 拿到成功态才推进——买家 JWT 与归属校验
 * （不存在与不归你同为 404）只挡住别人的流水，最终依据在渠道那边。
 *
 * <p>异步通知（渠道服务器 POST 过来）仍是未建项：它带不上买家 JWT，入口只能是「匿名路由 + 报文验签 +
 * 按渠道凭据定位流水」。
 */
@Tag(name = "payments", description = "买家支付")
@RestController
@RequestMapping("/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;

    /**
     * 发起支付：仅待支付主订单可付；金额以主订单为准，前端不报价。创建各子订单的 PENDING 流水（不动订单状态）。
     *
     * <p>真实渠道（支付宝）会同时返回 {@code payUrl}：前端跳过去完成付款，回来再调确认；
     * MOCK 渠道 {@code payUrl} 为 null，收银台直接调确认。
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentBatchView createPayment(@CurrentUser UUID userId, @Valid @RequestBody CreatePaymentRequest req) {
        return paymentService.payTrade(userId, req.tradeId());
    }

    /**
     * 确认整张主订单：逐条 PENDING→SUCCESS + 逐单推进子订单；全部付清后主订单落已支付。
     * 身份 = 买家 JWT，闸门 = 主订单归属（不存在与不归你同为 404）；本端点不做验签。
     */
    @PostMapping("/trade/{tradeId}/confirm")
    public PaymentBatchView confirmTrade(@CurrentUser UUID userId, @PathVariable UUID tradeId) {
        return paymentService.confirmTrade(userId, tradeId);
    }

    /**
     * 单条流水确认（订单列表补付单张）：保留给「只补一张子订单」的路径。
     * 主订单只有在全部子订单都付清时才会推进。
     */
    @PostMapping("/{id}/confirm")
    public PaymentView confirmPayment(@CurrentUser UUID userId, @PathVariable UUID id) {
        return PaymentView.from(paymentService.confirm(userId, id));
    }
}
