/**
 * 唯一的持久化出口：所有 SQL 都在这，其它模块只通过接口访问。
 *
 * <p>一个 event 有三种访问模式——点查完整原文、扫 + 聚合、事务化更新 issue——
 * 现在用一个 PG 表同时满足三种，但 {@link com.shop.telemetry.server.store.EventStore}
 * 按三种模式拆了方法。将来把 search 换到 ClickHouse，只有实现类变。
 */
package com.shop.telemetry.server.store;
