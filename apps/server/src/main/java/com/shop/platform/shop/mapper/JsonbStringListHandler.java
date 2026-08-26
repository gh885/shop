package com.shop.platform.shop.mapper;

import com.shop.platform.infra.db.JsonbListTypeHandler;
import java.util.List;
import tools.jackson.core.type.TypeReference;

/** 权限码字符串列表 ↔ jsonb（shop.shop_members.permissions） */
public class JsonbStringListHandler extends JsonbListTypeHandler<String> {

    @Override
    protected TypeReference<List<String>> typeRef() {
        return new TypeReference<>() {};
    }
}
