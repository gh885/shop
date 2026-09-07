package com.shop.platform.address.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.address.model.AddressStatus;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 商家地址 —— 单表「地址本体 + 用途标记」模型（对齐淘宝地址库）：
 * 一条地址可同时承担「默认发货」「默认退货」（各自至多一个，部分唯一索引兜底），
 * 面单寄件人名称由 {@code companyName}（公司名称）承载。
 *
 * <p>归属店铺（shop.shops.id），跨 schema 裸引用不加 FK。order 打面单/售后经 address :: api 拿
 * 不可变快照（{@code resolveShipFrom/resolveReturnTo}），不直接读本表。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("merchant_address.addresses")
public class MerchantAddress {

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 归属店铺（shop.shops.id），跨 schema 裸引用不加 FK */
    private UUID shopId;

    /** 联系人/取件人 */
    private String contactName;

    /** 电话（面单取件联系，≠ 账号手机号） */
    private String phone;

    /** 行政区划代码（国标），映射省市区 */
    private String regionCode;

    /** 省（冗余展示） */
    private String province;

    /** 市 */
    private String city;

    /** 区/县（直辖市/直筒子市可为空） */
    private String district;

    /** 街道/门牌号详细地址 */
    private String detail;

    /** 邮编（可选） */
    private String postalCode;

    /** 地址所属公司名称（面单寄件人） */
    private String companyName;

    /** 备注（仓库/店铺备注等，可选） */
    private String note;

    /** 默认发货地址（每店至多一个，uk_addresses_default_ship） */
    private Boolean defaultShip;

    /** 默认退货地址（每店至多一个，uk_addresses_default_return） */
    private Boolean defaultReturn;

    /** 状态：ACTIVE / DISABLED */
    private AddressStatus status;

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
