package com.shop.platform.infra.web;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.SubaccountContext;
import java.util.UUID;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/** {@code @CurrentSubaccount UUID} 形参解析：取子账号认证过滤器写入的 {@link SubaccountContext}。 */
@Component
public class CurrentSubaccountArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentSubaccount.class)
                && UUID.class.isAssignableFrom(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(
            MethodParameter parameter,
            ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest,
            WebDataBinderFactory binderFactory) {
        UUID subaccountId = SubaccountContext.get();
        if (subaccountId == null) {
            // 缺失即 401 而非 null：能走到 handler 却没有子账号上下文，只可能是路径没被
            // SubaccountAuthFilter 覆盖——这是配置事故，必须在边界上炸（口径同 @CurrentUser）
            throw BusinessException.unauthorized("请先登录");
        }
        return subaccountId;
    }
}
