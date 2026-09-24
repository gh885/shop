package com.shop.platform.product.dto;

/**
 * 类目与其属性（销售规格 / 参数模板）的字段规则：新建与改名两个入参、属性与属性值两个弹窗共用一份。
 *
 * <p>每个值都等于它落进的那一列 {@code VARCHAR(n)}，权威出处写在各自那行上；等值关系由
 * {@code FieldRuleVocabularyTest} 核对（不连库、不起 Spring）。<b>值一个都没改</b>——数字经 springdoc
 * 导出进契约，动数字属于接口变更。
 *
 * <p><b>为什么不与 {@link ProductFieldRules} 合成一个类</b>：类目是平台运营维护的字典，商品是卖家维护的数据，
 * 两者的表单在两个端、改的人不同。同名不同档的那几格（属性名 32 vs 参数名 32 vs 商品标题 30）一旦并成一份，
 * 放宽类目属性名就会连带放宽商品参数——那是 GEN-58 要挡的「按数字分档」。
 */
public final class CategoryFieldRules {

    /** 类目名上限（字）：{@code product.categories.name VARCHAR(64)} */
    public static final int NAME_MAX = 64;

    /**
     * 类目图标那一格的上限（字）：{@code product.categories.icon_url VARCHAR(255)}。
     *
     * <p>与 {@link ProductFieldRules#IMAGE_KEY_MAX} 同宽但是两格：V39 那批「把历史完整 URL 剥成对象存储 key」
     * 的清洗没有覆盖这一列（它清的是 products.main_image / products.images / products.detail_images /
     * skus.image / category_attr_values.image），所以这一格今天还可能装着整条 URL。合并成一个常量就等于
     * 把两件事绑死——将来清洗完这一列要收紧到 key 的长度时，会连带改掉商品图片那一档。
     */
    public static final int ICON_MAX = 255;

    /** 一个销售规格维度（属性名，如「颜色」）的上限：{@code product.category_attrs.name VARCHAR(32)} */
    public static final int ATTR_NAME_MAX = 32;

    /**
     * 一个规格取值（如「红色」）的上限：{@code product.category_attr_values.value VARCHAR(64)}。
     *
     * <p>卖家自填的规格值（{@code SpecSelectionRequest.customValues} 的条目）会自动建档成这一表的行，
     * 所以那个入参引用的是<b>这同一个常量</b>，不是另抄一个 64——它落的确实是同一列。
     */
    public static final int ATTR_VALUE_MAX = 64;

    /**
     * 规格取值配图的 key 上限：{@code product.category_attr_values.image VARCHAR(512)}（V36 加列时给的就是 512）。
     *
     * <p><b>这是列宽漂移，不是概念差异</b>：它与 {@link ProductFieldRules#IMAGE_KEY_MAX}（255，商品主图 / 图集 /
     * SKU 图）装的是同一种东西——对象存储 key（两列都在 V39 的清洗清单里）。今天两档并存，只是因为加列的迁移不同批。
     * 刻意<b>不</b>收成 255：入站收到 255 会让运营已能填的那 257 字符无声失效，而统一列宽属于库变更
     * （要 {@code ALTER COLUMN TYPE}，见 V66 的先例）。这笔账记在 {@code docs/business-rules/crosscut.md}，
     * 由 {@code FieldRuleVocabularyTest} 钉住「两档各自等于自己那一列」，漂移只能以显式改登记的方式发生。
     */
    public static final int ATTR_VALUE_IMAGE_MAX = 512;

    private CategoryFieldRules() {}
}
