package com.shop.platform.infra.web;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 请求路径的规范化与命名空间归属判定（JwtAuthFilter / StaffAuthFilter / ShopMembershipFilter /
 * PermissionInterceptor 及判权启动自检共用）。
 *
 * <p>Servlet 的 getRequestURI() 返回未解码原文，而 Spring MVC 按解码后的路径路由——直接拿原文做
 * startsWith("/admin") 这类前缀判断会被编码变体绕过（如 /%61dmin/** 解码后命中管理端路由）。
 * 因此凡原文与路由视角可能不一致的路径（百分号编码、路径参数、冗余斜杠、点号段）一律返回 null，
 * 由调用方统一 400 拒绝。本服务全部路由为纯 ASCII 字面量 + UUID 路径变量，检索关键词走查询串，
 * 拒绝不影响任何正常请求。
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class RequestPaths {

    /** 平台员工（管理端）命名空间 */
    public static final String ADMIN_NAMESPACE = "/admin";

    /** 卖家（商家工作台）命名空间 */
    public static final String SELLER_NAMESPACE = "/seller";

    /**
     * 受判权保护的命名空间：这些前缀下的 handler 缺 {@code @RequirePermission} 一律拒绝。
     *
     * <p>判权拦截器与「启动自检」必须共用这一份清单——两边各抄一遍时，往清单里加第三个命名空间只会让
     * 一边生效一边漏网，而漏的那边正是文档宣称的「双保险」失效处。
     */
    public static final List<String> GUARDED_NAMESPACES = List.of(ADMIN_NAMESPACE, SELLER_NAMESPACE);

    /** 管理端自服务前缀（登录 / 刷新 / me / 登出）：只吃认证，豁免授权 */
    public static final String ADMIN_SELF_SERVICE_PREFIX = ADMIN_NAMESPACE + "/auth/";

    /**
     * 买家认证端点前缀。refresh cookie 的 {@code path} 由它拼出（ACC-21 收窄到刷新端点），
     * 与 {@code @RequestMapping("/auth")} 同源：路由前缀挪了而 cookie path 还写死字面量时，
     * 凭证不会再随请求发出——症状是「登录后刷新一律 401」，不在任何一处编译期可见。
     */
    public static final String BUYER_AUTH_PREFIX = "/auth/";

    /**
     * 卖家子账号认证根（无尾斜杠）。子账号是第三种认证主体（{@code kind=subaccount}），凭证与买家的手机号账号
     * 体系完全隔离，故端点收在自己的前缀下：登录 / 刷新 / 激活 / 发激活码匿名可达，
     * me / 登出 / 改密只吃子账号令牌。
     *
     * <p>刻意<b>不</b>挂在 {@code /seller} 下：那会把「子账号自助端点」拖进受判权保护的命名空间，
     * 而它只吃认证不吃授权（判权豁免清单只认 {@link #ADMIN_SELF_SERVICE_PREFIX}，多一份豁免就等于
     * 命名空间词表有了第二处定义）。{@code /auth} 本就不在受保护命名空间里，无需任何豁免。
     *
     * <p>两个常量成对，分工不同：<b>根</b>进匿名白名单——白名单按 {@code startsWith} 匹配，而
     * {@code PermissionVocabularyTest} 要求「前缀命中的路由也必须落在同一个命名空间里」，带尾斜杠的写法会让
     * {@code /auth/subaccount/login} 掉进那条缝（前缀命中而命名空间不命中）。<b>带斜杠的那个</b>只用于
     * 拼端点路径与 refresh cookie 的 {@code path}。
     */
    public static final String SUBACCOUNT_AUTH_ROOT = "/auth/subaccount";

    /** 子账号端点前缀（拼路径与 cookie path 用，见 {@link #SUBACCOUNT_AUTH_ROOT}） */
    public static final String SUBACCOUNT_AUTH_PREFIX = SUBACCOUNT_AUTH_ROOT + "/";

    /** 路径是否落在受判权保护的命名空间内 */
    public static boolean inGuardedNamespace(String path) {
        return GUARDED_NAMESPACES.stream().anyMatch(prefix -> inNamespace(path, prefix));
    }

    /** 路径是否是管理端自服务端点（判权豁免） */
    public static boolean isAdminSelfService(String path) {
        return path.startsWith(ADMIN_SELF_SERVICE_PREFIX);
    }

    /**
     * 规范化请求路径（去 contextPath）；含不可安全前缀匹配的构造时返回 null。
     */
    public static String routePath(HttpServletRequest request) {
        String path = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (!contextPath.isEmpty()) {
            path = path.substring(contextPath.length());
        }
        return isCanonical(path) ? path : null;
    }

    /**
     * 命名空间归属判定：{@code /admin} 与 {@code /admin/**} 算命中，{@code /admins} 不算。
     *
     * <p>裸 {@code startsWith(prefix)} 会把 {@code /adminfoo} 也算进管理端命名空间——过滤链与判权拦截器
     * 若各写一套，同一路径可能一边算命中一边算不命中。收在这里，两处共用同一判定。
     */
    public static boolean inNamespace(String path, String prefix) {
        return path.equals(prefix) || path.startsWith(prefix + "/");
    }

    private static boolean isCanonical(String path) {
        // '%' 百分号编码（/%61dmin）、';' 路径参数（容器按段剥离）、'//' 冗余斜杠、
        // '.' / '..' 点号段（容器映射前归一化）：原文与路由视角不一致，一律拒绝
        if (path.indexOf('%') >= 0 || path.indexOf(';') >= 0 || path.contains("//")) {
            return false;
        }
        for (String segment : path.split("/")) {
            if (segment.equals(".") || segment.equals("..")) {
                return false;
            }
        }
        return true;
    }
}
