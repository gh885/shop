package com.shop.platform.payment.gateway;

/** 支付网关侧失败（渠道拒退、超时、连接异常等）——由调用方按其语义取舍，不包装成业务异常。 */
public class PaymentGatewayException extends RuntimeException {

    public PaymentGatewayException(String message, Throwable cause) {
        super(message, cause);
    }

    public PaymentGatewayException(String message) {
        super(message);
    }
}
