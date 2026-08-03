package com.shop.platform.product.mapper;

import com.shop.platform.infra.JsonbListTypeHandler;
import java.util.List;
import tools.jackson.core.type.TypeReference;

/** product.params / skus.attributes 列：{name, value} 条目列表，两个形状共用 */
public class JsonbParamItemsHandler extends JsonbListTypeHandler<ParamItem> {
    @Override
    protected TypeReference<List<ParamItem>> typeRef() {
        return new TypeReference<>() {};
    }
}
