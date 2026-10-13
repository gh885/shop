package com.shop.platform.infra.web;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.SubaccountContext;
import com.shop.platform.common.UserIdHolder;
import java.util.UUID;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * {@code @CurrentOperator UUID} 形参解析：店主取 {@link UserIdHolder}，子账号取 {@link SubaccountContext}。
 *
 * <p>两者在本服务的过滤器链里互斥（{@code SubaccountAuthFilter} 命中后 {@code JwtAuthFilter} 让位），
 * 所以「先有谁就用谁」不会取到一个混合值；两个都没有只可能是该路径没被任何身份链覆盖，抛 401。
 */
@Component
public class CurrentOperatorArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentOperator.class)
                && UUID.class.isAssignableFrom(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(
            MethodParameter parameter,
            ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest,
            WebDataBinderFactory binderFactory) {
        UUID userId = UserIdHolder.get();
        if (userId != null) {
            return userId;
        }
        UUID subaccountId = SubaccountContext.get();
        if (subaccountId != null) {
            return subaccountId;
        }
        throw BusinessException.unauthorized("请先登录");
    }
}
