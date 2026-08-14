package com.shop.platform.common;

import java.util.List;

/** 分页返回包装：只暴露 records + total，把 MyBatis-Plus Page 的插件噪音字段挡在 API 边界外 */
public record PageResult<T>(List<T> records, long total) {}
