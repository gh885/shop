package com.shop.platform.aftersale.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 售后申请原因 —— 买家主张的是哪一种权利，系统由此判得出来。
 *
 * <p>在此之前理由只是一段自由文本（AFS-10）：「无理由退货」和「质量不好」在库里长得一样，
 * 而这三件事全压在原因上——七天无理由强制（{@link #NO_REASON} 才可能成立，见 AFS-45）、
 * 日后的运费分责（谁的原因谁出运费）、以及售后统计。文本继续留着当补充说明，
 * 但它不再是判定依据：<b>判定只吃枚举</b>。
 *
 * <p>DB 列存 {@code name()}，CHECK 约束紧跟在取值集（V63）。历史单没有 code（列为可空），
 * 不回填成 {@link #OTHER}——把「不知道」写成「其他」，统计就再也分不出来了。
 */
@Schema(enumAsRef = true)
public enum AfterSaleReason {

    /** 七天无理由退货（消保法第 25 条）：唯一可能触发「卖家不得拒绝」的原因，还须商品声明支持且在窗口内 */
    NO_REASON,

    /** 商品质量问题 */
    QUALITY_ISSUE,

    /** 与商品描述不符 */
    NOT_AS_DESCRIBED,

    /** 商品破损、污渍（含包装破损） */
    DAMAGED,

    /** 卖家发错货 */
    WRONG_ITEM,

    /** 少件、漏发 */
    MISSING_ITEM,

    /** 其他（选了「其他」就得在补充说明里写清楚，否则卖家无从判断） */
    OTHER
}
