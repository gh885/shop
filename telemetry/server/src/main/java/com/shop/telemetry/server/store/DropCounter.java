package com.shop.telemetry.server.store;

/**
 * 丢弃计数。
 *
 * <p>"为什么这条事件没了"是自建平台最常缺的答案。每条链路只要有丢弃分支，就必须能在这里
 * 留下 (项目, 类型, 原因) 的计数，否则排障时只剩"我记得它应该发过"。
 */
public interface DropCounter {

    void increment(String projectId, String kind, String reason);
}
