package com.shop.platform.order;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "shop.order.enabled", matchIfMissing = true)
public class OrderModuleConfig {}
