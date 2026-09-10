package com.shop.platform.logistics.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 承运商字典 —— 把「快递公司」从卖家手打的自由文本收成稳定标识。
 *
 * <p>{@link #code} 是对接物流商接口用的稳定标识（顺丰 SF），{@link #name} 是展示名。
 * 包裹上两者都存：code 指身份，name 是发货时刻的展示快照（承运商改名不改写历史单据）。
 * 一期无此表（发货是自由文本、字典没有消费者），二期随发货入口归一并入。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("logistics.carriers")
public class Carrier {

    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 稳定标识（SF / ZTO / YTO…），对接物流商接口时用它 */
    private String code;

    /** 展示名（顺丰速运） */
    private String name;

    /** 停用后不可再选；历史单据与已落包裹不受影响 */
    private Boolean enabled;

    private Integer sortNo;

    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
