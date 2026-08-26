package com.shop.platform;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * 启动自检（docs/permission-details.md ENF-05）：受保护命名空间（/admin、/seller）的每个 handler 必须显式声明
 * {@link RequirePermission}（/admin/auth/** 自服务端点豁免）。与 PermissionInterceptor 的运行时
 * 默认拒绝构成双保险——漏标炸在开发期，而不是生产期莫名 403。
 */
class AdminEndpointGuardTest extends WebControllerTestSupport {

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping handlerMapping;

    @Test
    void 受保护命名空间接口_除管理端自服务外_必须携带权限注解() {
        List<String> missing = new ArrayList<>();

        handlerMapping.getHandlerMethods().forEach((info, handlerMethod) -> {
            java.util.Set<String> patterns = info.getPatternValues();
            boolean guardedNamespace = patterns.stream().anyMatch(AdminEndpointGuardTest::underGuardedPrefix);
            if (!guardedNamespace) {
                return;
            }
            // 自服务端点（登录/刷新/me/登出）只吃认证不吃授权
            boolean selfService = patterns.stream().allMatch(p -> p.startsWith("/admin/auth"));
            if (selfService) {
                return;
            }
            HandlerMethod hm = handlerMethod;
            // 测试探针控制器（如 FiltersPathNormalizationTest 的 /admin/secret）在 test-classes 里，
            // 被组件扫描带进上下文但不属于生产契约，不在本自检范围
            String codeSource = hm.getBeanType()
                    .getProtectionDomain()
                    .getCodeSource()
                    .getLocation()
                    .getPath();
            if (codeSource.contains("test-classes")) {
                return;
            }
            boolean declared = hm.hasMethodAnnotation(RequirePermission.class)
                    || hm.getBeanType().isAnnotationPresent(RequirePermission.class);
            if (!declared) {
                missing.add(patterns + " -> " + hm.getBeanType().getSimpleName());
            }
        });

        assertTrue(missing.isEmpty(), "以下受保护命名空间接口缺 @RequirePermission 注解: " + missing);
    }

    /** 与 PermissionInterceptor.GUARDED_PREFIXES 对齐的前缀判定（/admin、/seller） */
    private static boolean underGuardedPrefix(String path) {
        return List.of("/admin", "/seller").stream().anyMatch(p -> path.equals(p) || path.startsWith(p + "/"));
    }
}
