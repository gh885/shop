package com.shop.platform.cart;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "shop.cart.enabled", matchIfMissing = true)
public class CartModuleConfig {}
