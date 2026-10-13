package com.shop.platform.infra.web;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 注入「本条卖家请求的操作者 ID」（{@code UUID}）：店主时是 {@code account.users.id}，子账号时是
 * {@code account.shop_subaccounts.id}。由 {@link CurrentOperatorArgumentResolver} 从
 * {@code UserIdHolder} / {@code SubaccountContext} 中取先有的那一个。
 *
 * <p>只给「需要记下是谁干的、而不需要区分他是什么身份」的端点用（电话明文索取、评价回复这类留痕动作）。
 * 需要判定身份的（店主专属、子账号自助）一律用 {@code @CurrentUser} 或 {@code @CurrentSubaccount}——
 * 那两个注解缺失即 401，本注解缺失也 401，但值本身是哪个 id 空间由请求携带的令牌决定。
 *
 * <p>不参与 OpenAPI（已登记进 springdoc 忽略表）。
 */
@Documented
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentOperator {}
