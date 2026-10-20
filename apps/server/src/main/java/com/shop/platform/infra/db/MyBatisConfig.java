package com.shop.platform.infra.db;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.autoconfigure.ConfigurationCustomizer;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.OptimisticLockerInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.TenantLineInnerInterceptor;
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

    /**
     * 租户 + 分页 + 乐观锁插件。
     *
     * <p><b>顺序不能改</b>：MyBatis-Plus 要求租户插件排在分页与乐观锁之前——分页插件会改写
     * count 语句，若租户条件在它之后才加，count 与实际数据页的条件就会不一致（总数含别家行）。
     * 官方文档的推荐顺序是「多租户 → 分页/乐观锁」。
     *
     * <p>租户条件只在卖家请求里生效（{@link ShopTenantHandler} 读 {@code ShopIdHolder}），
     * 买家端、管理端、定时任务不受影响。这是与 V90 RLS 策略配套的应用层半边。
     */
    @Bean
    MybatisPlusInterceptor mybatisPlusInterceptor(ShopTenantHandler shopTenantHandler) {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new TenantLineInnerInterceptor(shopTenantHandler));
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.POSTGRE_SQL));
        interceptor.addInnerInterceptor(new OptimisticLockerInnerInterceptor());
        return interceptor;
    }
}
