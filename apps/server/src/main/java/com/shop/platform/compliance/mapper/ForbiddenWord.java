package com.shop.platform.compliance.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 违禁词表的一行：一个词 + 它的分类 + 是否启用。
 *
 * <p>{@code word} 存原样（不做归一），归一（大小写/全半角）在 {@code ForbiddenWordMatcher} 的纯函数里做——
 * 判定口径不落库，改归一规则不用迁移数据。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("compliance.forbidden_words")
public class ForbiddenWord extends BaseEntity {

    /** 词本身 */
    private String word;

    /** {@link com.shop.platform.compliance.api.ForbiddenCategory} 枚举名 */
    private String category;

    /** 停用 = 闸门不读它（运营下线某个词；删行同效，但保留 enabled 便于临时静音而不丢历史） */
    private Boolean enabled;
}
