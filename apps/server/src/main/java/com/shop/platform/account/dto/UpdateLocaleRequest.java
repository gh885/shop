package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 改语言偏好。
 *
 * <p>只做形校验（非空、长度），白名单在 service 走 {@code SupportedLocales}——词表是
 * {@code contracts/i18n.config.yaml} 里的配置而不是编译期常量，抄进注解就是第二份会漂的清单。
 *
 * @param preferredLocale BCP 47 标签，如 {@code zh-Hans-CN} / {@code en-US}
 * @param expectedAccountId 客户端以为自己在改谁的偏好。与令牌里的操作人不一致就拒——
 *     同浏览器切换账号时，页面上的选择器还停在上一个人的渲染结果上，
 *     不挡的话「点一下语言」会把偏好写到刚登进来的那个人身上
 */
public record UpdateLocaleRequest(
        @NotBlank @Size(max = 35) String preferredLocale, @NotBlank String expectedAccountId) {}
