package com.shop.platform.user;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "user.user.enabled", matchIfMissing = true)
public class UserModuleConfig {}
