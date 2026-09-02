package com.shop.platform.infra.web;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 注入当前登录买家 ID（{@code UUID}），由 {@link CurrentUserArgumentResolver} 从
 * {@code UserIdHolder}（JwtAuthFilter 设值）取出。
 *
 * <p>存在的意义不是少打字，而是把「本端点需要登录态」从方法体里的一行 {@code UserIdHolder.get()}
 * 提到方法签名上——签名即契约，漏配过滤器时 resolver 直接抛 401，不再让 null 顺着流到下游变成 NPE。
 *
 * <p>不参与 OpenAPI：已在 {@code OpenApiConfig} 里登记进 springdoc 的忽略注解表，
 * 否则裸 {@code UUID} 形参会被当成 query 参数写进契约、污染前端 SDK。
 */
@Documented
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentUser {}
