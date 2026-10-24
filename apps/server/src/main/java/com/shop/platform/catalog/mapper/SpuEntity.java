package com.shop.platform.catalog.mapper;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.catalog.model.IdentityKind;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * catalog.spu 行映射——商品主数据。商家级，没有 {@code shop_id}；店铺归属在 offer 上。
 *
 * <p>时间列由数据库管：created_at 靠列默认 now()，updated_at 由 {@code trg_spu_touch}
 * 触发器维护。两个字段对 insert/update 都封闭（{@link FieldStrategy#NEVER}），实体不背时间语义，
 * 也杜绝「读出来再整行回写」把别人的写入盖掉。
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@TableName("catalog.spu")
public class SpuEntity {

    /** 应用侧生成（Ids.newId()），不走数据库默认。 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** {@code merchant}（商家建）/ {@code standard}（平台标准品） */
    private String spuType;

    private UUID merchantId;
    private UUID categoryId;
    private UUID brandId;
    private String modelNo;
    private IdentityKind identityKind;
    private String matchKey;
    private String title;
    private UUID standardSpuId;
    private String standardMatchedBy;

    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private OffsetDateTime createdAt;

    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private OffsetDateTime updatedAt;
}
