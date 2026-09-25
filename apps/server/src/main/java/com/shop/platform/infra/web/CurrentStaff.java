package com.shop.platform.infra.web;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** 注入当前请求的平台员工 ID（{@code UUID}），由 {@link CurrentStaffArgumentResolver} 从 {@code StaffContext} 取出。 */
@Documented
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentStaff {}
