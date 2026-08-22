package com.shop.platform.cms.mapper;

import com.shop.platform.infra.db.JsonbListTypeHandler;
import java.util.List;
import tools.jackson.core.type.TypeReference;

/** cms.nav_entries.subs 列：首页导航分组 [{"name":"洗衣机","items":["滚筒洗衣机",...]}] */
public class JsonbNavGroupListHandler extends JsonbListTypeHandler<NavGroup> {
    @Override
    protected TypeReference<List<NavGroup>> typeRef() {
        return new TypeReference<>() {};
    }
}
