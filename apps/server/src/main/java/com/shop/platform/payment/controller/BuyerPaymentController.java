package com.shop.platform.payment.controller;

import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.payment.api.PaymentCommand;
import com.shop.platform.payment.api.PaymentView;
import com.shop.platform.payment.service.PaymentService;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家侧支付入口：主动查单与回跳页查单。
 *
 * <p><b>发起支付的入口不在这里</b>，在 {@code POST /api/buyer/orders/{orderGroupId}/pay}（trade 的 controller）。
 * 因为发起支付要先知道"该付多少"，而那只有订单持有者 trade 知道；
 * payment 一旦回查 trade 就会成环。所以 payment 只暴露"收钱"和"查单"，
 * 金额由 trade 算好通过 {@code PaymentCommand.create} 传进来。
 *
 * <p>权限口径：买家侧不查权限点，只查「这单是不是我的」——买家没有卖家那套角色体系，
 * 拿 {@code Permission} 去卡会把所有买家挡在外面。归属校验在 service 里做，那才有订单上下文。
 *
 * <p>渠道异步回调不在这里，在 {@code POST /api/payments/notify/{channel}}——那是渠道的事，不是买家的。
 */
@RestController
@RequestMapping("/api/buyer/payments")
public class BuyerPaymentController {

    private final PaymentCommand payments;
    private final PaymentService service;
    private final Authorizer authorizer;

    public BuyerPaymentController(PaymentCommand payments, PaymentService service, Authorizer authorizer) {
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
     * 回跳页用：按 {@code out_trade_no} 查支付单。
     *
     * <p>单独开这个口是因为支付宝回跳只带商户订单号，不带我们的支付单 id。
     * 按业务键查走 query 参数——路径段留给资源 id，别把查询条件伪装成资源层级。
     */
    @GetMapping
    public PaymentView findByOutTradeNo(@RequestParam String outTradeNo) {
        return service.findViewByOutTradeNo(outTradeNo, authorizer.current().operatorId());
    }
}
