package com.shop.platform.infra.web;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 注入当前子账号 ID（{@code UUID}），由 {@link CurrentSubaccountArgumentResolver} 从
 * {@code SubaccountContext}（SubaccountAuthFilter 设值）取出。
 *
 * <p>与 {@code @CurrentUser} 是两个不同的 id 空间，用法上不许互相顶替：需要「店主」的端点写
 * {@code @CurrentUser}（子账号拿不到值 → 401），需要「这条卖家请求的操作者是谁」的端点写
 * {@code @CurrentOperator}。
 *
 * <p>不参与 OpenAPI（已登记进 springdoc 忽略表），否则裸 {@code UUID} 形参会变成 query 参数写进契约。
 */
@Documented
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentSubaccount {}
