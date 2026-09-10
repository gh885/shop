package com.shop.platform.logistics.service;

import java.time.OffsetDateTime;

/**
 * 承运商原始轨迹节点（网关出参）—— 刻意保留原始形态（粗状态 + 自然语言），
 * 归一化不在这里做：网关只管"怎么把话问出来"，翻译成领域词表是 {@code model.TrackingNormalizer} 的事。
 *
 * @param rawState 承运商结构化状态（如快递鸟的 State），可空
 * @param description 原始描述文本，可空
 * @param location 发生地，可空
 * @param occurredAt 承运商事件时刻（状态推进与排序的依据）
 */
public record CarrierTrackingNode(String rawState, String description, String location, OffsetDateTime occurredAt) {}
