package com.shop.platform.product.mapper;

import com.shop.platform.infra.db.JsonbListTypeHandler;
import java.util.List;
import tools.jackson.core.type.TypeReference;

/** skus.attributes 列：SKU 规格取值 [{attrId, valueId, name, value}]（快照冗余，身份靠 spec_key 列） */
public class JsonbSkuAttrsHandler extends JsonbListTypeHandler<SkuAttr> {
    @Override
    protected TypeReference<List<SkuAttr>> typeRef() {
        return new TypeReference<>() {};
    }
}
