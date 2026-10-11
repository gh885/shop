package com.shop.platform.account.mapper;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.AuditedEntity;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 收货地址 —— 买家侧个人资料数据，独立于订单；order 模块结算时跨 schema 按 ID 只读。
 *
 * <p>label 字段：业务层区分「内置枚举 code」与「自定义文案」两种形态，DB 只存一个字符串。
 * 内置枚举见 {@link #LABEL_HOME} 等常量；其余非空字符串一律视为用户自定义标签原样入库。
 * 前端按已知 code 渲染图标，未知值按纯文本展示。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("account.addresses")
public class Address extends AuditedEntity {

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

    /** 归属买家（account.users.id），跨 schema 裸引用不加 FK */
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

    /**
     * 是否默认地址；每用户至多一个（部分唯一索引 uk_addresses_default 兜底）。
     *
     * <p>回写永不带这一列（插入要带）：默认标记只经 {@code AddressMapper.clearDefault} / {@code setDefaultFlag}
     * 的条件更新改。编辑地址走 {@code updateById} 整行回写，若顺带把打开页面时读到的标记写回，会把另一请求
     * 刚清掉的旧默认复活、撞唯一索引而让一次无关的编辑 409（第二写者列一律 NEVER，
     * {@code SecondWriterColumnGateTest}）。
     */
    @TableField(updateStrategy = FieldStrategy.NEVER)
    private Boolean isDefault;

    /** 软删除标记：NULL=有效，非 NULL=已删。MyBatis-Plus 逻辑删除，查询自动过滤 */
    @TableLogic(value = "null", delval = "NOW()")
    private OffsetDateTime deletedAt;
}
