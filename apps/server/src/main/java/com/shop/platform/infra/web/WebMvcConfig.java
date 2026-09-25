package com.shop.platform.infra.web;

import com.shop.platform.infra.security.authz.PermissionInterceptor;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Spring MVC 装配：请求日志/判权拦截器 + 上下文形参解析器 + CORS（controller 包只放 REST 入口，故放 infra）。 */
@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final HttpRequestLoggingInterceptor httpRequestLoggingInterceptor;

    private final PermissionInterceptor permissionInterceptor;

    private final CurrentUserArgumentResolver currentUserArgumentResolver;

    private final CurrentShopArgumentResolver currentShopArgumentResolver;

    private final CurrentStaffArgumentResolver currentStaffArgumentResolver;

    private final WebProperties props;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 判权注册在日志之后：拒绝响应同样被 http.request 事件记录
        registry.addInterceptor(httpRequestLoggingInterceptor);
        registry.addInterceptor(permissionInterceptor);
    }

    /**
     * 请求上下文形参解析：{@code @CurrentUser} / {@code @CurrentShop} 把过滤器装载的 ThreadLocal
     * 提到 handler 签名上。注册在这里而非各模块——上下文本身是共享层设施，
     * 各模块 controller 只消费注解，不认识 Holder。
     */
    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(currentUserArgumentResolver);
        resolvers.add(currentShopArgumentResolver);
        resolvers.add(currentStaffArgumentResolver);
    }

    /**
     * 允许来源来自配置而非硬编码：默认值是三个前端的本地开发端口，生产必须经
     * {@code SHOP_WEB_CORS_ALLOWED_ORIGINS} 覆盖成真实域名——否则换域名即全站跨域失败。
     *
     * <p>本地开发其实走 Vite proxy 同源（见各 app 的 vite.config），CORS 不参与；
     * 这份配置是给「前端与后端不同源」的部署形态用的。不开 allowCredentials：refresh token 走
     * httpOnly cookie，跨源携带需要同时放开凭证与精确来源，真要跨源部署时再按域名逐个评估。
     */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOrigins(props.corsAllowedOrigins().toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS")
                .exposedHeaders("x-request-id");
    }
}
