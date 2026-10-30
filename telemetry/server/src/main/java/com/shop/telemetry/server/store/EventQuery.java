package com.shop.telemetry.server.store;

import java.time.Instant;

/**
 * 扫描类查询的条件。
 *
 * <p>{@code projectId} 必填且**进 SQL 的 WHERE**——不是"查出来再比对"。这条和 shop 后端的
 * 数据归属规则同源：无归属访问不存在"先查后过滤"的写法。
 *
 * @param issueId 可选：issue 详情页里只看这一组
 * @param limit 必须有上限，禁止无界扫描
 */
public record EventQuery(String projectId, Instant from, Instant to, Long issueId, int limit) {}
