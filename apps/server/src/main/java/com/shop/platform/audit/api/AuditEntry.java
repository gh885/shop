package com.shop.platform.audit.api;

import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * 一条待写入的审计记录。
 *
 * <p>{@code action} 必须是 {@code audit.audit_action} 里登记过的动作名——清单驱动，不是注解驱动。见
 * {@link AuditCommand}。
 *
 * <p>操作人为空的只有一种情况：定时任务、消息消费这类没有请求上下文的系统操作，此时 {@code operatorType} 记
 * {@code system}。
 */
public record AuditEntry(
        String action,
        String objectType,
        String objectId,
        String operatorType,
        UUID operatorId,
        UUID merchantId,
        Map<String, FieldChange> changes,
        String result) {

    public static final String OPERATOR_SYSTEM = "system";

    private static final Set<String> OPERATOR_TYPES = Set.of("buyer", "merchant", "staff", OPERATOR_SYSTEM);
    private static final Set<String> RESULTS = Set.of("success", "failure");

    public AuditEntry {
        requireText(action, "action");
        requireText(objectType, "objectType");
        requireText(objectId, "objectId");
        requireText(result, "result");
        Objects.requireNonNull(operatorType, "operatorType");
        Objects.requireNonNull(changes, "changes");

        if (!OPERATOR_TYPES.contains(operatorType)) {
            throw new IllegalArgumentException("未知的操作人类型: " + operatorType);
        }
        if (!RESULTS.contains(result)) {
            throw new IllegalArgumentException("未知的结果: " + result);
        }
        if (OPERATOR_SYSTEM.equals(operatorType) == (operatorId != null)) {
            throw new IllegalArgumentException("系统操作必须没有 operatorId，人工操作必须有");
        }
        if (changes.isEmpty()) {
            throw new IllegalArgumentException("审计必须带变更内容，空 changes 等于只记了一句废话");
        }
    }

    public static AuditEntry byStaff(
            String action,
            String objectType,
            String objectId,
            UUID staffId,
            UUID merchantId,
            Map<String, FieldChange> changes) {
        return new AuditEntry(action, objectType, objectId, "staff", staffId, merchantId, changes, "success");
    }

    public static AuditEntry bySystem(
            String action, String objectType, String objectId, Map<String, FieldChange> changes) {
        return new AuditEntry(action, objectType, objectId, OPERATOR_SYSTEM, null, null, changes, "success");
    }

    public AuditEntry failed() {
        return new AuditEntry(action, objectType, objectId, operatorType, operatorId, merchantId, changes, "failure");
    }

    private static void requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " 不能为空");
        }
    }
}
