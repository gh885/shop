package com.shop.platform.infra;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.autoconfigure.ConfigurationCustomizer;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import java.util.UUID;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class MyBatisConfig {

    /** MyBatis 没有内置 UUID 的 TypeHandler，PG uuid 列会映射为 null（全库主键 uuidv7 依赖它） */
    @Bean
    ConfigurationCustomizer uuidTypeHandlerCustomizer() {
        return configuration -> configuration.getTypeHandlerRegistry().register(UUID.class, new UuidTypeHandler());
    }

    /** 分页插件：selectPage 的 COUNT + LIMIT 改写靠它，不注册会静默返回全量（假分页） */
    @Bean
    MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.POSTGRE_SQL));
        return interceptor;
    }
}
