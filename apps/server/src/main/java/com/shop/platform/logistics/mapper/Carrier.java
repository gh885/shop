package com.shop.platform.logistics.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.AuditedEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 承运商字典 —— 把「快递公司」从卖家手打的自由文本收成稳定标识。
 *
 * <p>{@link #code} 是对接物流商接口用的稳定标识（顺丰 SF），{@link #name} 是展示名。
 * 包裹上两者都存：code 指身份，name 是发货时刻的展示快照（承运商改名不改写历史单据）。
 * 一期无此表（发货是自由文本、字典没有消费者），二期随发货入口归一并入。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("logistics.carriers")
public class Carrier extends AuditedEntity {

    /** 稳定标识（SF / ZTO / YTO…），对接物流商接口时用它 */
    private String code;

    /** 展示名（顺丰速运） */
    private String name;

    /** 停用后不可再选；历史单据与已落包裹不受影响 */
    private Boolean enabled;

    private Integer sortNo;
}
