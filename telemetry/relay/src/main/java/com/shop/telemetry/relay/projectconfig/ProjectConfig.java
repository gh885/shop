package com.shop.telemetry.relay.projectconfig;

import java.util.Set;

/**
 * 控制面算好、数据面本地执行的配置。
 *
 * <p>这是本仓库最重要的一条形状约束：**治理规则低频变更、高频读取**，所以计算在上游、
 * 执行在下游内存里。一旦让 relay 每个 envelope 回查主库/配置服务，后面加采样、限流、
 * 脱敏、CORS 全都会变成改主路径。
 *
 * @param projectId 项目 id（DSN 路径里的那段）
 * @param publicKey DSN 里的 public key，公开、不保密
 * @param allowedOrigins 浏览器上报允许的 Origin（后端上报不带 Origin，不受限）
 * @param tracesSampleRate 0~1，**只影响事务**，不影响错误事件
 * @param enabled 关掉后一律 4xx，不上报也不进队列
 * @param revision 版本号，用于本地缓存失效（M2 接控制面主动推）
 */
public record ProjectConfig(
        String projectId,
        String publicKey,
        Set<String> allowedOrigins,
        double tracesSampleRate,
        boolean enabled,
        long revision) {}
