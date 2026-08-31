package com.shop.platform.product.mapper;

import com.shop.platform.infra.db.JsonbListTypeHandler;
import java.util.List;
import tools.jackson.core.type.TypeReference;

/** product.params 列：{attrId, name, value} 非销售参数条目列表（attrId 可空，无模板期为 null） */
public class JsonbParamItemsHandler extends JsonbListTypeHandler<ParamItem> {
    @Override
    protected TypeReference<List<ParamItem>> typeRef() {
        return new TypeReference<>() {};
    }
}
