package com.shop.platform.product.mapper;

import com.shop.platform.infra.JsonbListTypeHandler;
import java.util.List;
import tools.jackson.core.type.TypeReference;

/** product.specs 列：销售属性模板 [{"name":"颜色","values":["黑","白"]}] */
public class JsonbSpecItemsHandler extends JsonbListTypeHandler<SpecItem> {
    @Override
    protected TypeReference<List<SpecItem>> typeRef() {
        return new TypeReference<>() {};
    }
}
