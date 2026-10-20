package com.shop.platform.audit.model;

import java.util.Objects;

/**
 * 一个字段的前后值。
 *
 * <p>审计只记变更字段，不记整行快照——整行快照会让表体积翻十倍，而排查时真正要看的永远是"哪个字段从什么变成了什么"。
 *
 * @param before 变更前；新增记录时为 {@code null}
 * @param after 变更后；删除记录时为 {@code null}
 */
public record FieldChange(Object before, Object after) {

    public static FieldChange from(Object before) {
        return new FieldChange(before, null);
    }

    public static FieldChange to(Object after) {
        return new FieldChange(null, after);
    }

    public static FieldChange of(Object before, Object after) {
        return new FieldChange(Objects.requireNonNull(before, "before"), Objects.requireNonNull(after, "after"));
    }
}
