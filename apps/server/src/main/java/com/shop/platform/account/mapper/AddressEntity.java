package com.shop.platform.account.mapper;

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
 * account.addresses 行映射。
 *
 * <p>时间列由数据库管：created_at 靠列默认 now()，updated_at 只在显式 SET 的 SQL 里写。
 * 两个字段对 insert/update 都封闭（{@link FieldStrategy#NEVER}），实体不背时间语义，
 * 也杜绝「读出来再整行回写」把别人的写入盖掉。
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@TableName("account.addresses")
public class AddressEntity {

    /** 应用侧生成（Ids.newId()），不走数据库默认。 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    private UUID buyerId;
    private String receiverName;
    private String phone;
    private String regionCode;
    private String province;
    private String city;
    private String district;
    private String detail;
    private String label;

    /**
     * 包装类型是给 lombok 的：{@code boolean isDefault} 会生成 {@code isDefault()}，
     * MyBatis 按属性名反解成 "default"，对不上 {@code is_default} 列；Boolean 走
     * {@code getIsDefault()} 正常解析。列本身 NOT NULL，不会真的出现 null。
     */
    private Boolean isDefault;

    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private OffsetDateTime createdAt;

    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private OffsetDateTime updatedAt;
}
