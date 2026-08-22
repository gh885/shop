package com.shop.platform.cms;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "shop.cms.enabled", matchIfMissing = true)
public class CmsModuleConfig {}
