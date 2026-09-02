package com.shop.platform.infra.web;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 注入当前请求的店铺上下文 ID（{@code UUID}），由 {@link CurrentShopArgumentResolver} 从
 * {@code ShopIdHolder}（ShopMembershipFilter 校验 X-Shop-Id 成员身份后设值）取出。
 *
 * <p>与 {@link CurrentUser} 同理：卖家侧端点的「需要店铺上下文」写进签名，
 * 而不是散落在方法体的 {@code ShopIdHolder.get()} 里。
 */
@Documented
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentShop {}
