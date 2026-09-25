package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.product.model.AttrKind;
import com.shop.platform.product.model.CategoryAttrStatus;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CategoryAttrMapper extends BaseMapper<CategoryAttr> {

    /**
     * 该类目的参数模板（kind=PARAM 且启用）：params 校验的受控集。
     *
     * <p>只认 PARAM——销售属性（SPEC）参与 SKU 生成，不走 params 那条校验；只认 ENABLED——禁用的模板条目
     * 对存量商品自洽，但新商品不可再选（同 categories 的查询侧裁剪语义）。无模板时交出空集，
     * 「维持自由文本、不校验」这个后果由调用方裁决。
     */
    default List<CategoryAttr> selectParamTemplate(UUID categoryId) {
        return selectList(new LambdaQueryWrapper<CategoryAttr>()
                .eq(CategoryAttr::getCategoryId, categoryId)
                .eq(CategoryAttr::getKind, AttrKind.PARAM)
                .eq(CategoryAttr::getStatus, CategoryAttrStatus.ENABLED));
    }

    /**
     * 某类目的模板条目，按 sort 升、同权再按创建时间升（两个列表页共用同一套顺序，只是 enabledOnly 不同）。
     *
     * <p>{@code enabledOnly} 是「管理端看全量、公开页只看启用」这两份展示口径的开关，不是状态守卫：
     * 两个调用方都是读本模块自己的模板表，且都收在同一个取数点，顺序因此不会各抄一份。
     */
    default List<CategoryAttr> selectByCategory(UUID categoryId, boolean enabledOnly) {
        return selectList(new LambdaQueryWrapper<CategoryAttr>()
                .eq(CategoryAttr::getCategoryId, categoryId)
                .eq(enabledOnly, CategoryAttr::getStatus, CategoryAttrStatus.ENABLED)
                .orderByAsc(CategoryAttr::getSort)
                .orderByAsc(CategoryAttr::getCreatedAt));
    }
}
