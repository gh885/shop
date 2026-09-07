package com.shop.platform.address;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "shop.address.enabled", matchIfMissing = true)
public class AddressModuleConfig {}
