package com.shop.platform.catalog.mapper;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * catalog.spu_media 行映射——商品图。图挂规格值，不挂 SKU。
 *
 * <p>这张表没有 {@code updated_at}，也没有触发器——图改了就删旧行插新行；
 * created_at 靠列默认 now()，同样封闭（{@link FieldStrategy#NEVER}）。
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@TableName("catalog.spu_media")
public class SpuMediaEntity {

    /** 应用侧生成（Ids.newId()），不走数据库默认。 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    private UUID spuId;

    /** {@code null} = 通用图；非 null = 挂在某个规格属性上（如"颜色"）。 */
    private UUID attributeId;

    /** 规格值，如 {@code 红色}。和 attributeId 必须同时有或同时无（{@code ck_spu_media_spec}）。 */
    private String specValue;

    private String url;
    private String mediaType;
    private int sort;

    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private OffsetDateTime createdAt;
}
