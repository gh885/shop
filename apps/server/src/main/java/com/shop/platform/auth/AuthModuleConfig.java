package com.shop.platform.auth;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.shop.platform.auth.infra.JwtProperties;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "shop.auth.enabled", matchIfMissing = true)
@EnableConfigurationProperties(JwtProperties.class)
public class AuthModuleConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }
}
