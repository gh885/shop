package com.shop.platform.seller.mapper;

import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.db.JsonColumns;
import com.shop.platform.seller.api.FreightRule;
import com.shop.platform.seller.model.ShippingTemplateStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 运费模板的读写。表在 {@code seller} schema，只有这里碰它。
 *
 * <p><b>读只返回值对象，写只认参数。</b>地区匹配和金额计算不在这里——那要看折后金额，是算价的事，
 * 见 {@code pricing.model.FreightFee}。这个类一旦开始算钱，就又把两个模块粘回去了。
 *
 * <p>{@code regions} 是 jsonb，所以读和写都手写序列化：读侧 {@code CAST(regions AS text)} 拿到 JSON 文本，
 * 写侧 {@code CAST(#{regions} AS jsonb)} 要求先给它一个 JSON 字符串。解析逻辑本来就只在这个类里。
 */
@Mapper
public interface ShippingTemplateMapper {

    /**
     * 一个店同时只能有一个 active 模板（{@code uq_shipping_template_active}），
     * 所以这里取一条是确定的，不存在"取哪个"的问题。
     */
    @Select(
            """
            SELECT id, charge_by, free_over, CAST(regions AS text) AS regions
              FROM seller.shipping_template
             WHERE shop_id = #{shopId} AND status = 'active'
            """)
    Optional<ActiveRow> findActive(@Param("shopId") UUID shopId);

    /** 商家后台的列表。带上店铺名，否则商家开了两家店分不清哪套是哪套。 */
    @Select(
            """
            SELECT t.id, t.shop_id, s.merchant_id, s.name AS shop_name, t.name, t.charge_by,
                   t.free_over, CAST(t.regions AS text) AS regions_json, t.status, t.created_at, t.updated_at
              FROM seller.shipping_template t
              JOIN seller.shop s ON s.id = t.shop_id
             WHERE s.merchant_id = #{merchantId}
             ORDER BY t.id DESC
            """)
    List<TemplateRow> listByMerchant(@Param("merchantId") UUID merchantId);

    @Select(
            """
            SELECT t.id, t.shop_id, s.merchant_id, s.name AS shop_name, t.name, t.charge_by,
                   t.free_over, CAST(t.regions AS text) AS regions_json, t.status, t.created_at, t.updated_at
              FROM seller.shipping_template t
              JOIN seller.shop s ON s.id = t.shop_id
             WHERE s.merchant_id = #{merchantId} AND t.shop_id = #{shopId}
             ORDER BY t.id DESC
            """)
    List<TemplateRow> listByShop(@Param("merchantId") UUID merchantId, @Param("shopId") UUID shopId);

    /** 带上 {@code merchant_id}：归属判断不能靠调用方记得传对，得让这一行自己说它属于谁。 */
    @Select(
            """
            SELECT t.id, t.shop_id, s.merchant_id, s.name AS shop_name, t.name, t.charge_by, t.free_over,
                   CAST(t.regions AS text) AS regions_json, t.status, t.created_at, t.updated_at
              FROM seller.shipping_template t
              JOIN seller.shop s ON s.id = t.shop_id
             WHERE t.id = #{id}
            """)
    Optional<TemplateRow> find(@Param("id") UUID id);

    /** 新建落库。id 由应用侧生成（Ids.newId()），注解 SQL 拿不到 RETURNING 的返回值。 */
    default UUID insert(
            UUID shopId,
            String name,
            FreightRule.ChargeBy chargeBy,
            Long freeOver,
            List<FreightRule.Region> regions,
            ShippingTemplateStatus status) {
        UUID id = Ids.newId();
        insertRow(id, shopId, name, chargeBy, freeOver, writeRegions(regions), status);
        return id;
    }

    @Insert(
            """
            INSERT INTO seller.shipping_template (id, shop_id, name, charge_by, free_over, regions, status)
            VALUES (#{id}, #{shopId}, #{name}, #{chargeBy}, #{freeOver}, CAST(#{regions} AS jsonb), #{status})
            """)
    void insertRow(
            @Param("id") UUID id,
            @Param("shopId") UUID shopId,
            @Param("name") String name,
            @Param("chargeBy") FreightRule.ChargeBy chargeBy,
            @Param("freeOver") Long freeOver,
            @Param("regions") String regions,
            @Param("status") ShippingTemplateStatus status);

    /**
     * {@code status <> 'archived'} 写在 where 里，不写在 service 的 if 里：
     * 两个人同时编辑同一条，先读后判会双双通过，库上这一句只有一个能改到。
     *
     * @return 影响行数；0 = 这条已经归档了（或者不存在），调用方据此报 409
     */
    default int updateContent(
            UUID id, String name, FreightRule.ChargeBy chargeBy, Long freeOver, List<FreightRule.Region> regions) {
        return updateContentRow(id, name, chargeBy, freeOver, writeRegions(regions));
    }

    @Update(
            """
            UPDATE seller.shipping_template
               SET name = #{name}, charge_by = #{chargeBy}, free_over = #{freeOver},
                   regions = CAST(#{regions} AS jsonb)
             WHERE id = #{id} AND status <> 'archived'
            """)
    int updateContentRow(
            @Param("id") UUID id,
            @Param("name") String name,
            @Param("chargeBy") FreightRule.ChargeBy chargeBy,
            @Param("freeOver") Long freeOver,
            @Param("regions") String regions);

    /**
     * 启用前先把同店的 active 归档。
     *
     * <p>必须<b>先</b>归档旧的再启新的：{@code uq_shipping_template_active} 是部分唯一索引，
     * 反过来的话新的一写就撞键。两句在同一个事务里，中途失败两边都不生效。
     */
    @Update(
            """
            UPDATE seller.shipping_template
               SET status = 'archived'
             WHERE shop_id = #{shopId} AND status = 'active' AND id <> #{keepId}
            """)
    int archiveActiveOfShop(@Param("shopId") UUID shopId, @Param("keepId") UUID keepId);

    /** @return 影响行数；0 = 目标已归档或不存在 */
    @Update(
            """
            UPDATE seller.shipping_template
               SET status = #{status}
             WHERE id = #{id} AND status <> 'archived'
            """)
    int setStatus(@Param("id") UUID id, @Param("status") ShippingTemplateStatus status);

    /**
     * 写回去的键名必须和读时一致（{@code areaCodes} 驼峰，不是 {@code area_codes}）：
     * 两个方向共用同一份 record 定义，改名会让库里出现两种形状，而读只认一种。
     */
    private static String writeRegions(List<FreightRule.Region> regions) {
        return JsonColumns.write(regions);
    }

    /**
     * 库里的行，原样带出 {@code regions} 的 JSON 文本。
     *
     * <p>不在这一层解析成 {@link FreightRule.Region}：解析会抛异常，而列表页一条坏数据不该
     * 让整个列表 500。解析放在 service 里，坏数据能被单独标出来。
     */
    record TemplateRow(
            UUID id,
            UUID shopId,
            UUID merchantId,
            String shopName,
            String name,
            FreightRule.ChargeBy chargeBy,
            Long freeOver,
            String regionsJson,
            ShippingTemplateStatus status,
            Instant createdAt,
            Instant updatedAt) {}

    /** active 模板的窄投影，给 {@link com.shop.platform.seller.api.ShippingTemplateQuery} 拼值对象用。 */
    record ActiveRow(UUID id, FreightRule.ChargeBy chargeBy, Long freeOver, String regions) {}
}
