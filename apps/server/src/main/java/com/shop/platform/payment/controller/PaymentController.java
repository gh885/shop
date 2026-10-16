package com.shop.platform.payment.controller;

import com.shop.platform.infra.web.CurrentUser;
import com.shop.platform.payment.dto.CreateCheckoutPaymentRequest;
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
 * 买家支付入口（V1 MOCK 渠道：两段式状态机）。
 *
 * <p>刻意独立于 /orders——收银台是 payment 模块的资产。发起创建 PENDING 流水，确认
 * （/payments/{id}/confirm）才推进订单状态机。幂等：重复发起返回同一笔 PENDING/SUCCESS 流水，不报错。
 *
 * <p><b>确认端点的闸门只有「调用人是这笔流水的买家」，它不是资金证明。</b>MOCK 渠道没有渠道侧凭据，
 * 「钱已付」这句话由调用方自己声明（收银台一次点按串起发起 + 确认，见 PAY-36），买家 JWT 与归属校验
 * （不存在与不归你同为 404）只挡住别人的流水，挡不住「没付也确认」。
 *
 * <p>接真实网关时这个端点要<b>下线</b>，不是换个实现继续跑：网关回调来自渠道服务器，带不上买家 JWT，
 * 入口身份只能是「匿名路由 + 报文验签 + 按渠道凭据定位流水」，先例是 {@code CarrierWebhookController}
 * （匿名可达 + 验签，验签不过按上下文闸门 403）。而本表今天连渠道交易号列都没有（V27 明写那批随网关
 * 落库），那条回调路由与验签形状也都不存在——不预留无调用者的抽象，届时随接网关那个 PR 一并定形
 * （见 {@code PaymentGateway} 头注释）。能平移的只有状态机与事务口径（条件转移 + 同事务 markPaid）。
 *
 * <p>届时放匿名白名单的只能是比 {@code /payments} 更长的一段（如 {@code /payments/callbacks/...}）：
 * {@code JwtProperties.skipPaths} 按前缀匹配，写 {@code /payments} 会连带本类这两条买家路由一起跳过
 * 认证过滤器——留着买家自助确认 = 买家不付钱即可把单推成 PAID，那正是这道闸最省事的失效方式。
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
    public PaymentView createPayment(@CurrentUser UUID userId, @Valid @RequestBody CreatePaymentRequest req) {
        return PaymentView.from(paymentService.pay(userId, req.orderId()));
    }

    /**
     * 确认支付（MOCK 渠道专用）：PENDING → SUCCESS + 推进订单。身份 = 买家 JWT，闸门 = 流水归属
     * （不存在与不归你同为 404）；本端点不做任何验签，也没有可验的渠道凭据。
     * 接真实网关时它被验签回调取代并下线，不与那个入口共用路由（理由见类注释）。
     */
    @PostMapping("/{id}/confirm")
    public PaymentView confirmPayment(@CurrentUser UUID userId, @PathVariable UUID id) {
        return PaymentView.from(paymentService.confirm(userId, id));
    }

    /**
     * 合并支付发起（一次多店结算的整批单）：按 checkout_key 逐单复用/补建 PENDING，返回批次总应付 + 逐单流水。
     * 收银台一次结算一起付，避免拆出的多张单里只付了第一张、其余挂到超时。
     */
    @PostMapping("/checkout")
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentBatchView createCheckoutPayment(
            @CurrentUser UUID userId, @Valid @RequestBody CreateCheckoutPaymentRequest req) {
        return PaymentBatchView.from(req.checkoutKey(), paymentService.payBatch(userId, req.checkoutKey()));
    }

    /**
     * 合并支付确认（MOCK 渠道专用）：整批 PENDING→SUCCESS + 逐单推进订单，同事务原子（任一单取消则整批回滚留 PENDING）。
     * 闸门与单笔 confirm 同为「调用人是这批流水的买家」，不做验签、无渠道凭据；接真实网关时一并被验签回调取代下线。
     */
    @PostMapping("/checkout/{checkoutKey}/confirm")
    public PaymentBatchView confirmCheckoutPayment(@CurrentUser UUID userId, @PathVariable UUID checkoutKey) {
        return PaymentBatchView.from(checkoutKey, paymentService.confirmBatch(userId, checkoutKey));
    }
}
