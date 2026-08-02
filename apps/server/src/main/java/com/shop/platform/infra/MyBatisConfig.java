package com.shop.platform.infra;

import com.baomidou.mybatisplus.autoconfigure.ConfigurationCustomizer;
import java.util.UUID;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class MyBatisConfig {

    /** MyBatis 没有内置 UUID 的 TypeHandler，PG uuid 列会映射为 null（全库主键 uuidv7 依赖它） */
    @Bean
    ConfigurationCustomizer uuidTypeHandlerCustomizer() {
        return configuration ->
                configuration.getTypeHandlerRegistry().register(UUID.class, new UuidTypeHandler());
    }
}
