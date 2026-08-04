package com.shop.platform.shop;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "shop.shop.enabled", matchIfMissing = true)
public class ShopModuleConfig {}
