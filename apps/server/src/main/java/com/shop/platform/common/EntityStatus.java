package com.shop.platform.common;

import java.util.Set;

/**
 * 实体启停二态（{@code active} / {@code disabled}）的唯一词表。
 *
 * <p>写入口 DTO 的 {@code @Pattern}（422 字段级错误）与 service 的第二道白名单
 * （service 也会被没有 DTO 的内部调用走到）都从这里取值，别再手写字面量——
 * 七处各写一份 "active"，将来加第三态时必然漂掉几处。
 */
public final class EntityStatus {

    public static final String ACTIVE = "active";

    public static final String DISABLED = "disabled";

    /** 写入口 DTO 的 {@code @Pattern(regexp = PATTERN)} 用。 */
    public static final String PATTERN = ACTIVE + "|" + DISABLED;

    public static final Set<String> ALL = Set.of(ACTIVE, DISABLED);

    private EntityStatus() {}
}
