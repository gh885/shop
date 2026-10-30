package com.shop.telemetry.server.ingest;

import com.shop.telemetry.server.grouping.FingerprintInput;
import com.shop.telemetry.server.issues.IssueEvent;
import com.shop.telemetry.server.store.EventRecord;

/**
 * 一次归一化的产物：要落库的事件 + 要更新的 issue 聚合 + 分组的输入。
 *
 * <p>三者一起产出（而不是各自去解析 payload）是刻意的：**同一次解析**必须同时喂给
 * "存原文"和"算分组"，否则两边对 release/transaction 的理解迟早不一致。
 */
public record NormalizedEvent(
        EventRecord event, IssueEvent issue, FingerprintInput fingerprintInput) {}
