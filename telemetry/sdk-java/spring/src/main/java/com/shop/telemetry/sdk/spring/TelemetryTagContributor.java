package com.shop.telemetry.sdk.spring;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

/**
 * 给事件补 shop 侧标签的钩子。
 *
 * <p>存在的理由：**采集端不该知道 shop 的领域模型**（tenant.id 从哪个 header 来、用户 id 在哪个
 * SecurityContext 里），而 shop 的业务代码又不该 import 采集 SDK。所以中间留这一层，
 * 由 shop 的 infra 模块提供一个实现，采集端只负责把它们贴到事件上。
 *
 * <p>典型实现：{@code request -> Map.of("tenant.id", tenantOf(request), "user.id", currentUserId())}。
 * 返回空 Map 也是合法的（M0 的默认实现就是空）。
 */
@FunctionalInterface
public interface TelemetryTagContributor {

    Map<String, String> tags(HttpServletRequest request);
}
