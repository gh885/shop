package com.shop.platform.product.mapper;

import com.shop.platform.infra.JsonbListTypeHandler;
import java.util.List;
import tools.jackson.core.type.TypeReference;

/** product.images 列：轮播图 URL 数组 */
public class JsonbStringListHandler extends JsonbListTypeHandler<String> {
    @Override
    protected TypeReference<List<String>> typeRef() {
        return new TypeReference<>() {};
    }
}
