package com.shop.platform.payment.controller;

import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.payment.api.PaymentCommand;
import com.shop.platform.payment.api.PaymentView;
import com.shop.platform.payment.service.PaymentService;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 支付入口：**主动查单** 与 **渠道回调**。
 *
 * <p><b>发起支付的入口不在这里</b>，在 {@code POST /api/orders/{orderGroupId}/pay}（trade 的 controller）。
 * 因为发起支付要先知道"该付多少"，而那只有订单持有者 trade 知道；
 * payment 一旦回查 trade 就会成环。所以 payment 只暴露"收钱"和"查单"，
 * 金额由 trade 算好通过 {@code PaymentCommand.create} 传进来。
 *
 * <p>权限口径：买家侧不查权限点，只查「这单是不是我的」——买家没有卖家那套角色体系，
 * 拿 {@code Permission} 去卡会把所有买家挡在外面。归属校验在 service 里做，那才有订单上下文。
 *
 * <p>回调方法收原始表单而不收 DTO：报文形状由渠道定，不由我们定。
 * 换一个渠道就换一套字段，用 DTO 会逼着每个渠道改一次我们的契约。
 */
@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    private static final Logger log = LoggerFactory.getLogger(PaymentController.class);

    private final PaymentCommand payments;
    private final PaymentService service;
    private final Authorizer authorizer;

    public PaymentController(PaymentCommand payments, PaymentService service, Authorizer authorizer) {
        this.payments = payments;
        this.service = service;
        this.authorizer = authorizer;
    }

    /** 主动查单。渠道回跳页上按支付单 id 查真相——回跳参数不可信，只有查单算数。 */
    @PostMapping("/{paymentId}/confirm")
    public PaymentCommand.Confirmation confirm(@PathVariable UUID paymentId) {
        return payments.confirm(paymentId, authorizer.current().operatorId());
    }

    /**
     * 渠道异步回调。**必须免登录**：渠道当然没有我们的令牌。
     *
     * <p>安全靠签名，不靠身份——{@code AlipayChannel.parseCallback} 验不过就抛。
     * 这也意味着它对所有人开放，所以里面不能做任何"重"的事，只有验签 + 一次 CAS。
     *
     * <p>返回值是给渠道看的：按渠道协议回 {@code success} 才算收到，否则它会一直重投。
     * 失败时也回 200 + {@code failure}：回 500 会让"签名错"变成无限重投。
     */
    @PostMapping("/notify/{channel}")
    public ResponseEntity<String> notify(@PathVariable String channel, @RequestParam Map<String, String> params) {
        try {
            service.handleCallback(new LinkedHashMap<>(params));
            return ResponseEntity.ok("success");
        } catch (RuntimeException e) {
            // 回 200 + failure 是为了不让渠道无限重投（回 500 它会一直重试）。
            // 但"吞掉"只针对响应体，日志里必须留痕——否则渠道说"我发过了"、
            // 我们这边查不到任何记录，只能靠猜。
            log.warn("渠道回调处理失败: channel={}", channel, e);
            return ResponseEntity.ok("failure");
        }
    }

    /**
     * 回跳页用：按 {@code out_trade_no} 查支付单。
     *
     * <p>单独开这个口是因为支付宝回跳只带商户订单号，不带我们的支付单 id。
     */
    @GetMapping("/by-out-trade-no/{outTradeNo}")
    public PaymentView findByOutTradeNo(@PathVariable String outTradeNo) {
        return service.findViewByOutTradeNo(outTradeNo, authorizer.current().operatorId());
    }
}
