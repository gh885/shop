package com.shop.platform.infra.db;

import com.baomidou.mybatisplus.autoconfigure.ConfigurationCustomizer;
import java.util.UUID;
import org.apache.ibatis.session.LocalCacheScope;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * MyBatis-Plus 全局配置（只调约定，不藏行为）。
 *
 * <p>两条：
 *
 * <ul>
 *   <li>枚举走 {@link DbEnumTypeHandler}——「库里存枚举名的小写」这条约定不因为换数据访问框架而变。
 *   <li>{@code argNameBasedConstructorAutoMapping}——@Select 的投影 record 按构造器参数名对列名
 *       （需要 {@code -parameters}，spring-boot-starter-parent 默认打开），加一列不用改映射代码，
 *       接替 RowMappers 的「列名到字段自动对上」。
 * </ul>
 */
@Configuration
public class MybatisPlusConfig {

    @Bean
    ConfigurationCustomizer mybatisConventions() {
        return configuration -> {
            configuration.setDefaultEnumTypeHandler(DbEnumTypeHandler.class);
            configuration.setArgNameBasedConstructorAutoMapping(true);
            // 本地缓存按语句失效：事务内的 UPDATE..RETURNING 走 @Select（如库存扣减、incrementAttempts），
            // 它不清一级缓存，同事务同参数的重复查询会读到旧值——JdbcClient 时代永远直查 DB，
            // 这里把语义拉回一致，不靠调用方记得绕缓存。
            configuration.setLocalCacheScope(LocalCacheScope.STATEMENT);
            // MyBatis 内建不认 UUID：不注册的话 BaseMapper 生成的参数映射运行期直接炸
            configuration.getTypeHandlerRegistry().register(UUID.class, UuidTypeHandler.class);
        };
    }
}
