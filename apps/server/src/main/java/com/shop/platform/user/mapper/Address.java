package com.shop.platform.user.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 收货地址 —— 买家侧个人资料数据，独立于订单；order 模块结算时跨 schema 按 ID 只读。
 *
 * <p>label 字段：业务层区分「内置枚举 code」与「自定义文案」两种形态，DB 只存一个字符串。
 * 内置枚举见 {@link #LABEL_HOME} 等常量；其余非空字符串一律视为用户自定义标签原样入库。
 * 前端按已知 code 渲染图标，未知值按纯文本展示。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("user_profile.addresses")
public class Address {

    /** 内置标签枚举。业务层只认这组 code；其余输入按自定义文案处理 */
    public static final String LABEL_HOME = "HOME";

    public static final String LABEL_WORK = "WORK";
    public static final String LABEL_SCHOOL = "SCHOOL";
    public static final String LABEL_PARENTS = "PARENTS";
    public static final String LABEL_FRIEND = "FRIEND";

    public static final Set<String> BUILTIN_LABELS =
            Set.of(LABEL_HOME, LABEL_WORK, LABEL_SCHOOL, LABEL_PARENTS, LABEL_FRIEND);

    /** 未指定标签时的默认值 */
    public static final String LABEL_DEFAULT = LABEL_HOME;

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 归属买家（auth.users.id），跨 schema 裸引用不加 FK */
    private UUID userId;

    /** 收件人 */
    private String receiverName;

    /** 收件手机号（可代收，≠ 账号手机号） */
    private String phone;

    /** 行政区划代码（国标），映射省市区 */
    private String regionCode;

    /** 省（冗余展示） */
    private String province;

    /** 市 */
    private String city;

    /** 区/县 */
    private String district;

    /** 街道/门牌号详细地址 */
    private String detail;

    /** 内置枚举 code（HOME/WORK/SCHOOL/PARENTS/FRIEND）或自定义文案 */
    private String label;

    /** 是否默认地址；每用户至多一个（部分唯一索引 uk_addresses_default 兜底） */
    private Boolean isDefault;

    /** 软删除标记：NULL=有效，非 NULL=已删。MyBatis-Plus 逻辑删除，查询自动过滤 */
    @TableLogic(value = "null", delval = "NOW()")
    private OffsetDateTime deletedAt;

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    /** 更新时间，插入/更新时自动填充 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
