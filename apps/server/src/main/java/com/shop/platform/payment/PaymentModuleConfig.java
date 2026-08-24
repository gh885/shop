package com.shop.platform.payment;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "shop.payment.enabled", matchIfMissing = true)
public class PaymentModuleConfig {}
