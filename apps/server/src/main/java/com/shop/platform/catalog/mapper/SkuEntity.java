package com.shop.platform.catalog.mapper;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.PgJsonbTypeHandler;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * catalog.sku 行映射——规格 + 价格 + 重量。价格只在这里，{@code offer} 不带价格。
 *
 * <p>时间列由数据库管：created_at 靠列默认 now()，updated_at 由 {@code trg_sku_touch}
 * 触发器维护。两个字段对 insert/update 都封闭（{@link FieldStrategy#NEVER}），实体不背时间语义，
 * 也杜绝「读出来再整行回写」把别人的写入盖掉。
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@TableName(value = "catalog.sku", autoResultMap = true)
public class SkuEntity {

    /** 应用侧生成（Ids.newId()），不走数据库默认。 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    private UUID spuId;

    /** 规格值 JSON 原文，形如 {@code {"<attributeId>": "红色"}}。读写都走 {@link PgJsonbTypeHandler}。 */
    @TableField(typeHandler = PgJsonbTypeHandler.class)
    private String specValues;

    /** 规格值按 attribute_id 排序后拼的串，只为加唯一索引 {@code uq_sku_spec}。 */
    private String specKey;

    private String barcode;
    private String identityKey;

    /** 价格，单位分（{@code ck_sku_price} 保证 ≥ 0）。 */
    private Long priceAmount;

    private String priceCurrency;
    private Integer weightG;
    private String status;

    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private OffsetDateTime createdAt;

    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private OffsetDateTime updatedAt;
}
