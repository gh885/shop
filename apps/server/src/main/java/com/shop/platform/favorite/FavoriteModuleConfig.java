package com.shop.platform.favorite;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "shop.favorite.enabled", matchIfMissing = true)
public class FavoriteModuleConfig {}
