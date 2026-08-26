package com.shop.platform.infra.web;

import com.shop.platform.infra.security.authz.PermissionInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Spring MVC 装配：请求日志拦截器 + CORS（controller 包只放 REST 入口，故放 infra）。 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final HttpRequestLoggingInterceptor httpRequestLoggingInterceptor;

    private final PermissionInterceptor permissionInterceptor;

    public WebMvcConfig(
            HttpRequestLoggingInterceptor httpRequestLoggingInterceptor, PermissionInterceptor permissionInterceptor) {
        this.httpRequestLoggingInterceptor = httpRequestLoggingInterceptor;
        this.permissionInterceptor = permissionInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 判权注册在日志之后：拒绝响应同样被 http.request 事件记录
        registry.addInterceptor(httpRequestLoggingInterceptor);
        registry.addInterceptor(permissionInterceptor);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOrigins(
                        "http://localhost:3000",
                        "http://localhost:5173",
                        "http://localhost:4000",
                        "http://localhost:5000")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS")
                .exposedHeaders("x-request-id");
    }
}
