package com.shop.platform.auth;

import com.shop.platform.infra.security.JwtProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "shop.auth.enabled", matchIfMissing = true)
@EnableConfigurationProperties(JwtProperties.class)
public class AuthModuleConfig {

    /**
     * BCrypt 代价因子。抽成常量供 {@code AuthService} 生成等时对比用的占位哈希 —— 两者代价必须一致，
     * 否则「用户不存在」与「密码错误」的耗时可区分，账号枚举面重新打开。
     */
    public static final int BCRYPT_STRENGTH = 12;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(BCRYPT_STRENGTH);
    }
}
