package com.shop.platform.admin;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "shop.admin.enabled", matchIfMissing = true)
public class AdminModuleConfig {}
