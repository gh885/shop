package com.shop.platform.product.dto;

/**
 * 商品域的字段规则：SPU 基本信息、SKU 更新项、规格选择、参数条目与搜索关键词，创建与编辑两个入参共用一份。
 *
 * <p>为什么单独立一个文件而不是把注解抄两遍：{@code CreateProductRequest} 与 {@code UpdateProductRequest}
 * 是同名字段的同一套规则，正则、长度、提示语此前在两个文件里各写一遍。今天这两份逐字节相同——
 * 相同正是可以放心收成一份的理由；而「改了创建忘了改编辑」在这类复制上是无声的：
 * 卖家会按入口不同拿到两种报错，测试却各测各的。词表与提示语放这里，两个 DTO 只剩 PATCH 语义的差别。
 *
 * <p>每个等于列宽的值都写在哪一列上，等值关系由 {@code FieldRuleVocabularyTest} 核对（不连库、不起 Spring）；
 * 类目侧的规则在 {@link CategoryFieldRules}，两边刻意不合并，理由写在那个类的头上。
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

    /**
     * 图片那一格的上限（字）：商品主图、轮播图与详情图的<b>数组条目</b>、SKU 图共用一个数，
     * 落点 {@code product.products.main_image} 与 {@code product.skus.image} 同为 {@code VARCHAR(255)}。
     *
     * <p>存的是对象存储 key 而非完整 URL（V39 把这几列的历史 URL 全剥成了 key），所以这一格量的是 key 的长度。
     * 它跟 {@link CategoryFieldRules#ATTR_VALUE_IMAGE_MAX}（512）是同一件东西的两档列宽——那笔账写在那里；
     * 类目图标（{@code CategoryFieldRules.ICON_MAX}）同宽但不同格，理由也在那里。
     */
    public static final int IMAGE_KEY_MAX = 255;

    /** SKU 展示名上限（字）：{@code product.skus.name VARCHAR(160)}（= SPU 名 + 规格值拼接，历史订单快照） */
    public static final int SKU_NAME_MAX = 160;

    /** SKU 业务编码上限（字）：{@code product.skus.sku_code VARCHAR(64)}；卖家端镜像 {@code apps/seller/src/product/constants.ts} */
    public static final int SKU_CODE_MAX = 64;

    /** 一个商品最多挂几个规格维度：{@code products.specs} 那一格；超出就是选不完的组合，不是「再想想」 */
    public static final int SPECS_MAX = 10;

    /**
     * 一个规格维度最多选 / 填几个取值：值域内（{@code valueIds}）与值域外（{@code customValues}）同一档是刻意的——
     * 两者一起决定这个维度展开进 SKU 矩阵的宽度，分开设档只会被刷得更宽的那一侧占满。
     */
    public static final int SPEC_VALUES_MAX = 20;

    /** 参数项名的上限（字）：{@code products.params} JSONB 里的条目，无列宽可对，这一格是产品口径 */
    public static final int PARAM_NAME_MAX = 32;

    /** 参数值的上限（字）：同上，JSONB 条目；与 {@link CategoryFieldRules#ATTR_VALUE_MAX} 同数但落点不同 */
    public static final int PARAM_VALUE_MAX = 64;

    /**
     * 搜索关键词上限（字）：管理端列表与买家侧 {@code ProductQuery} 两处同一档，落点是
     * {@code product.products.name VARCHAR(128)}——关键词长过被搜那一列，就永远搜不到东西，
     * 所以这一格的权威出处是被搜的那一列，不是「给搜索词留 128」。
     */
    public static final int KEYWORD_MAX = 128;

    private ProductFieldRules() {}
}
