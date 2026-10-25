package com.shop.platform.promotion.model;

import java.util.Locale;

/**
 * 促销规则的状态。库约束 {@code ck_promotion_status} 与这三个名字一一对应，库里存小写。
 *
 * <p>{@code active} 不唯一：满减、折扣、包邮可以同时生效，它们靠 {@code priority} 和
 * {@code mutex_group} 排队，不靠"只能有一条"。这和运费模板相反——一个店只能有一套运费。
 */
public enum RuleStatus {
    DRAFT,
    ACTIVE,
    ARCHIVED;

    public String dbValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static RuleStatus from(String raw) {
        return valueOf(raw.toUpperCase(Locale.ROOT));
    }

    /** 归档是终态：报价单引用过它，改内容就等于改历史证据。 */
    public boolean isReadOnly() {
        return this == ARCHIVED;
    }
}
