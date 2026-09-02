package com.shop.platform.infra.web;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.UserIdHolder;
import java.util.UUID;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * {@code @CurrentUser UUID} 形参解析：取 {@link UserIdHolder}（JwtAuthFilter 设值）。
 *
 * <p>缺失即 401 而非返回 null：能走到 handler 却没有用户上下文，只可能是该路径被误加进
 * {@code JwtProperties.skipPaths} 却又声明了需要登录——这是配置事故，必须在边界上炸，
 * 不能让 null 顺着 service 流下去变成难查的 NPE 或越权查询。
 */
@Component
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentUser.class)
                && UUID.class.isAssignableFrom(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(
            MethodParameter parameter,
            ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest,
            WebDataBinderFactory binderFactory) {
        UUID userId = UserIdHolder.get();
        if (userId == null) {
            throw BusinessException.unauthorized("请先登录");
        }
        return userId;
    }
}
