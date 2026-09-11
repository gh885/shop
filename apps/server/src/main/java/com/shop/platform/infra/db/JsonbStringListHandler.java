package com.shop.platform.infra.db;

import java.util.List;
import tools.jackson.core.type.TypeReference;

/**
 * {@code List<String>} ↔ jsonb 的通用形状：轮播图 URL 数组、权限码数组等所有「字符串列表」列共用，
 * 属于共享层（与 {@link JsonbListTypeHandler} 同包）。
 *
 * <p>业务形状子类（如 {@code List<SpecItem>}）仍留在各模块 mapper 包——跨模块只共享 String 这一种形状。
 */
public class JsonbStringListHandler extends JsonbListTypeHandler<String> {

    @Override
    protected TypeReference<List<String>> typeRef() {
        return new TypeReference<>() {};
    }
}
