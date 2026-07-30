package com.shop.platform.product;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "shop.product.enabled", matchIfMissing = true)
public class ProductModuleConfig {}
