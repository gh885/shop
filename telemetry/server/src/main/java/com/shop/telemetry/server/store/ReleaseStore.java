package com.shop.telemetry.server.store;

/**
 * 部署事件。RCA 的时间锚：没有"这一刻发布了什么"，故障归因就没有起点。
 */
public interface ReleaseStore {

    void record(String projectId, String version);
}
