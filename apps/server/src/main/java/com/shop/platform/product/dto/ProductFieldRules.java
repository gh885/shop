package com.shop.platform.product.dto;

/**
 * 商品基本信息的字段规则：创建与编辑两个入参共用一份，不各抄一遍。
 *
 * <p>为什么单独立一个文件而不是把注解抄两遍：{@code CreateProductRequest} 与 {@code UpdateProductRequest}
 * 是同名字段的同一套规则，正则、长度、提示语此前在两个文件里各写一遍。今天这两份逐字节相同——
 * 相同正是可以放心收成一份的理由；而「改了创建忘了改编辑」在这类复制上是无声的：
 * 卖家会按入口不同拿到两种报错，测试却各测各的。词表与提示语放这里，两个 DTO 只剩 PATCH 语义的差别。
 *
 * <p>注解元素值必须是编译期常量表达式，所以这里是常量而不是校验器；规则的执行仍由 Bean Validation 完成。
 */
public final class ProductFieldRules {

    /** 搜索标题上限（字）：卡片展示就那么宽，写长了只会被截断 */
    public static final int NAME_MAX = 30;

    /** 标题超限提示：草稿期允许空标题（发布前统一校验），所以这条只管长度不管必填 */
    public static final String NAME_MESSAGE = "商品标题最长 " + NAME_MAX + " 字";

    /**
     * 一句话卖点：可不填；填了就得写够一句（10~30 字）。
     *
     * <p>用 {@code @Pattern} 而不是 {@code @Size(min)}：空串＝清空已填内容（PATCH 语义下要与「不传」区分），
     * 而 {@code Size(min)} 会把空串一起判死。
     */
    public static final String SELL_POINT_PATTERN = "^$|^[\\s\\S]{10,30}$";

    /** 卖点超限提示 */
    public static final String SELL_POINT_MESSAGE = "卖点填了就写 10~30 字，不想写可以留空";

    private ProductFieldRules() {}
}
