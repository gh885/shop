package com.shop.telemetry.relay.projectconfig;

import java.util.Optional;

/**
 * 配置取数。M0 的实现从本地 properties 读（{@link PropertiesProjectConfigSource}），
 * M2 换成查控制面 + Redis 缓存 + 主动失效——**接口形状不变**，这是关键。
 */
public interface ProjectConfigSource {

    Optional<ProjectConfig> find(String projectId);
}
