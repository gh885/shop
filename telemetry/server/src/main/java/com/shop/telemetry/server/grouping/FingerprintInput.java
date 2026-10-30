package com.shop.telemetry.server.grouping;

import java.util.List;

/**
 * 分组的纯输入：只含参与计算的部分，不含 event_id / 时间 / 用户等会让结果漂移的字段。
 *
 * @param explicitFingerprint 用户/客户端显式指定（"智能默认 + 逃生口"），非空则直接采用
 * @param exceptionType 异常类名；无堆栈时的降级依据
 * @param frames 已归一化的栈帧串（in_app 过滤、去行号、去绝对路径）
 * @param transaction 路由模板名，形如 {@code GET /api/orders/:id}，**不是真实 URL**
 */
public record FingerprintInput(
        String explicitFingerprint, String exceptionType, List<String> frames, String transaction) {}
