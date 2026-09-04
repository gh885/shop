package com.shop.platform.common;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.function.Function;

/** 分页返回包装：只暴露 records + total，把 MyBatis-Plus Page 的插件噪音字段挡在 API 边界外 */
public record PageResult<T>(
        @Schema(requiredMode = REQUIRED) List<T> records, @Schema(requiredMode = REQUIRED) long total) {
    /**
     * 逐条变形，total 原样带过。
     *
     * <p>存在的理由：controller 把 service 形状转 Response 时，「解构 records → map → 重新 new PageResult
     * 并记得把 total 抄过去」这段样板在项目里出现了十余次，而 total 抄错不会有任何编译或测试信号——
     * 只会表现为前端分页器页数不对。把它收成一个方法后，total 再也不经过人手。
     */
    public <R> PageResult<R> map(Function<? super T, ? extends R> mapper) {
        List<R> mapped = records.stream().<R>map(mapper).toList();
        return new PageResult<>(mapped, total);
    }
}
