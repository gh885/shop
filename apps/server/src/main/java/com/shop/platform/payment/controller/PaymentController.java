package com.shop.platform.payment.controller;

import com.shop.platform.infra.security.Public;
import com.shop.platform.payment.service.PaymentService;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 渠道异步回调。**必须免登录**：渠道当然没有我们的令牌。
 *
 * <p>安全靠签名，不靠身份——{@code AlipayChannel.parseCallback} 验不过就抛。
 * 这也意味着它对所有人开放，所以里面不能做任何"重"的事，只有验签 + 一次 CAS。
 *
 * <p>返回值是给渠道看的：按渠道协议回 {@code success} 才算收到，否则它会一直重投。
 * 失败时也回 200 + {@code failure}：回 500 会让"签名错"变成无限重投。
 *
 * <p>收原始表单而不收 DTO：报文形状由渠道定，不由我们定。
 * 换一个渠道就换一套字段，用 DTO 会逼着每个渠道改一次我们的契约。
 *
 * <p>买家侧的查单入口在 {@code BuyerPaymentController}，发起支付在 trade 的订单入口。
 */
@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    private static final Logger log = LoggerFactory.getLogger(PaymentController.class);

    private final PaymentService service;

    public PaymentController(PaymentService service) {
        this.service = service;
    }

    @Public
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
}
