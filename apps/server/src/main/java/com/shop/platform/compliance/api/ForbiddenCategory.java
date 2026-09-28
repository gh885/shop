package com.shop.platform.compliance.api;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 违禁词分类（COM-01）：只用于给卖家一个<b>可行动</b>的提示（「标题含广告法违禁词」比「标题含违禁词」有用），
 * 不参与命中判定——同一列不做两件事。
 *
 * <p>与 V73 迁移里 {@code ck_forbidden_words_category} 的 CHECK 同一组值，加值要同时改两处。
 */
@Schema(enumAsRef = true)
public enum ForbiddenCategory {

    /** 广告法绝对化用语（最佳/第一/国家级…） */
    AD_LAW,

    /** 欺诈与交易陷阱（刷单/假一赔十/走私…） */
    FRAUD,

    /** 色情低俗 */
    PORN,

    /** 涉政敏感 */
    POLITICS,

    /** 侵权与假冒（高仿/山寨…） */
    INFRINGEMENT,

    /** 其他违规（办证/发票代开…） */
    OTHER
}
