package com.shop.platform.product.model;

/**
 * 类目属性模板的类型：销售属性（spec，商品详情选规格）vs 参数（param，非销售属性/详情参数）。
 *
 * <p>这是「这个属性在商品发布里扮演什么角色」的类型语义——不是布尔开关。DB 存 {@code name()}（varchar）。
 */
public enum AttrKind {

    /** 销售属性（规格）：详情页可逐值勾选，直接决定 SKU 组合 */
    SPEC,

    /** 非销售参数（详情页展示的分类字段，如材质/产地） */
    PARAM;

    public boolean isSpec() {
        return this == SPEC;
    }
}
