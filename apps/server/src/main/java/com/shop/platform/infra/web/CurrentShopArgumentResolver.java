package com.shop.platform.infra.web;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ShopIdHolder;
import java.util.UUID;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * {@code @CurrentShop UUID} 形参解析：取 {@link ShopIdHolder}（ShopMembershipFilter 设值）。
 *
 * <p>缺失即 403：过滤器已放行却没有店铺上下文，说明该端点不在 /seller 命名空间下却声明了店铺依赖，
 * 属配置事故；返回 403 而非 401 是因为此时用户通常已登录，缺的是店铺成员身份。
 */
@Component
public class CurrentShopArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentShop.class)
                && UUID.class.isAssignableFrom(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(
            MethodParameter parameter,
            ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest,
            WebDataBinderFactory binderFactory) {
        UUID shopId = ShopIdHolder.get();
        if (shopId == null) {
            throw BusinessException.forbidden("缺少店铺上下文");
        }
        return shopId;
    }
}
