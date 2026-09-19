package com.shop.platform.infra.db;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import com.github.f4b6a3.uuid.UuidCreator;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.apache.ibatis.reflection.MetaObject;
import org.springframework.stereotype.Component;

@Component
public class MyBatisPlusMetaObjectHandler implements MetaObjectHandler {

    @Override
    public void insertFill(MetaObject metaObject) {
        OffsetDateTime now = OffsetDateTime.now();
        // 全库主键统一 uuidv7，应用层生成（见 docs/architecture.md §5）
        // 不用 strictInsertFill：它对主键字段会因 TableInfo 填充策略跳过
        if (metaObject.hasGetter("id")
                && metaObject.getValue("id") == null
                && metaObject.getGetterType("id") == UUID.class) {
            metaObject.setValue("id", UuidCreator.getTimeOrderedEpoch());
        }
        strictInsertFill(metaObject, "createdAt", OffsetDateTime.class, now);
        strictInsertFill(metaObject, "updatedAt", OffsetDateTime.class, now);
    }

    @Override
    public void updateFill(MetaObject metaObject) {
        strictUpdateFill(metaObject, "updatedAt", OffsetDateTime.class, OffsetDateTime.now());
    }
}
