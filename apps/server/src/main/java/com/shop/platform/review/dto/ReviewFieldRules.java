package com.shop.platform.review.dto;

/**
 * 评价入参的数字词表：注解只引用这里的常量（GEN-61：数字字面量不许出现在注解里）。
 *
 * <p>「一段人写的说明」不在这里另起一档：评价文字、追评、卖家回复都引用
 * {@link com.shop.platform.common.NoteFieldRules#FREE_TEXT_MAX}——同一个概念（给人看的自由文本）就该只有一份定义。
 */
public final class ReviewFieldRules {

    /** 每条评价行最多几张图：再多就不是「晒图」而是相册，且展示区要为它重排版 */
    public static final int IMAGES_PER_ITEM_MAX = 3;

    /** 图片对象存储 key 上限：与商品图同一档（存 key 不存 URL，REV-07） */
    public static final int IMAGE_KEY_MAX = 255;

    /** 星级下界：DB CHECK 同值 */
    public static final int RATING_MIN = 1;

    /** 星级上界：DB CHECK 同值 */
    public static final int RATING_MAX = 5;

    private ReviewFieldRules() {}
}
