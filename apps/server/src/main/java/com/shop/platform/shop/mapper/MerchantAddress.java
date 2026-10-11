package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.AuditedEntity;
import com.shop.platform.shop.model.AddressStatus;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 商家地址 —— 单表「地址本体 + 用途标记」模型（对齐淘宝地址库）：
 * 一条地址可同时承担「默认发货」「默认退货」（各自至多一个，部分唯一索引兜底），
 * 面单寄件人名称由 {@code companyName}（公司名称）承载。
 *
 * <p>归属店铺（shop.shops.id），跨 schema 裸引用不加 FK。order 打面单/售后经 shop :: api 拿
 * 不可变快照（{@code resolveShipFrom/resolveReturnTo}），不直接读本表。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("shop.addresses")
public class MerchantAddress extends AuditedEntity {

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

    /**
     * 默认发货地址（每店至多一个，uk_addresses_default_ship）。
     *
     * <p>两个默认标记回写永不带（插入要带）：它们只经 {@code MerchantAddressMapper} 的条件更新改——
     * {@code clearDefaultShip} 把旧默认转为假、{@code setDefaultFlags} 把目标行置真 / 置假。编辑地址走
     * {@code updateById} 整行回写，若顺带把打开页面时读到的标记写回，会把另一请求刚清掉的旧默认复活、
     * 撞部分唯一索引（第二写者列一律 NEVER，{@code SecondWriterColumnGateTest}）。
     */
    @TableField(updateStrategy = FieldStrategy.NEVER)
    private Boolean defaultShip;

    /** 默认退货地址（每店至多一个，uk_addresses_default_return）；回写口径同 {@link #defaultShip} */
    @TableField(updateStrategy = FieldStrategy.NEVER)
    private Boolean defaultReturn;

    /** 状态：ACTIVE / DISABLED */
    private AddressStatus status;

    /** 软删除标记：NULL=有效，非 NULL=已删。MyBatis-Plus 逻辑删除，查询自动过滤 */
    @TableLogic(value = "null", delval = "NOW()")
    private OffsetDateTime deletedAt;
}
