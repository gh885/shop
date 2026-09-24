package com.shop.platform;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.RequestPaths;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * 启动自检（docs/conventions/permission-codes.md）：受保护命名空间的每个 handler 必须显式声明
 * {@link RequirePermission}（管理端自服务端点豁免）。与 PermissionInterceptor 的运行时默认拒绝构成双保险——
 * 漏标炸在开发期，而不是生产期莫名 403。两边共用 {@link RequestPaths} 那一套命名空间词汇，不各抄一份清单；
 * 不依赖 Spring 上下文的同一不变量由 {@code PermissionVocabularyTest} 静态核对。
 *
 * <p>本自检只看生产 handler。测试专用探针控制器已移出组件扫描范围
 * （{@code com.shop.testfixtures.ProbeController}），不会再以假端点混进来。
 */
class AdminEndpointGuardTest extends WebControllerTestSupport {

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping handlerMapping;

    @Test
    void 受保护命名空间接口_除管理端自服务外_必须携带权限注解() {
        List<String> missing = new ArrayList<>();

        handlerMapping.getHandlerMethods().forEach((info, handlerMethod) -> {
            Set<String> patterns = info.getPatternValues();
            boolean guardedNamespace = patterns.stream().anyMatch(RequestPaths::inGuardedNamespace);
            if (!guardedNamespace) {
                return;
            }
            // 自服务端点（登录/刷新/me/登出）只吃认证不吃授权
            boolean selfService = patterns.stream().allMatch(RequestPaths::isAdminSelfService);
            if (selfService) {
                return;
            }
            HandlerMethod hm = handlerMethod;
            boolean declared = hm.hasMethodAnnotation(RequirePermission.class)
                    || hm.getBeanType().isAnnotationPresent(RequirePermission.class);
            if (!declared) {
                missing.add(patterns + " -> " + hm.getBeanType().getSimpleName());
            }
        });

        assertTrue(missing.isEmpty(), "以下受保护命名空间接口缺 @RequirePermission 注解: " + missing);
    }
}
