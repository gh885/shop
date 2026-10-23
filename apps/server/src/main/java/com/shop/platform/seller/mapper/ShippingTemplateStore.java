package com.shop.platform.seller.mapper;

import com.shop.platform.infra.db.JsonColumns;
import com.shop.platform.seller.api.FreightRule;
import com.shop.platform.seller.api.ShippingTemplateQuery;
import com.shop.platform.seller.model.ShippingTemplateStatus;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;

/**
 * 运费模板的读写。表在 {@code seller} schema，只有这里碰它。
 *
 * <p><b>读只返回值对象，写只认参数。</b>地区匹配和金额计算不在这里——那要看折后金额，是算价的事，
 * 见 {@code pricing.model.FreightFee}。这个类一旦开始算钱，就又把两个模块粘回去了。
 *
 * <p>{@code regions} 是 jsonb，所以读和写都手写序列化：{@code DataClassRowMapper} 不认 jsonb，
 * 而 {@code CAST(:regions AS jsonb)} 要求先给它一个 JSON 字符串。解析逻辑本来就只在这个类里。
 */
@Component
public class ShippingTemplateStore implements ShippingTemplateQuery {

    /**
     * 一个店同时只能有一个 active 模板（{@code uq_shipping_template_active}），
     * 所以这里取一条是确定的，不存在"取哪个"的问题。
     */
    private static final String FIND_ACTIVE =
            """
            SELECT id, charge_by, free_over, CAST(regions AS text) AS regions
              FROM seller.shipping_template
             WHERE shop_id = :shopId AND status = 'active'
            """;

    /** 商家后台的列表。带上店铺名，否则商家开了两家店分不清哪套是哪套。 */
    private static final String LIST_BY_MERCHANT =
            """
            SELECT t.id, t.shop_id, s.merchant_id, s.name AS shop_name, t.name, t.charge_by,
                   t.free_over, CAST(t.regions AS text) AS regions, t.status, t.created_at, t.updated_at
              FROM seller.shipping_template t
              JOIN seller.shop s ON s.id = t.shop_id
             WHERE s.merchant_id = :merchantId
             ORDER BY t.id DESC
            """;

    private static final String LIST_BY_SHOP =
            """
            SELECT t.id, t.shop_id, s.merchant_id, s.name AS shop_name, t.name, t.charge_by,
                   t.free_over, CAST(t.regions AS text) AS regions, t.status, t.created_at, t.updated_at
              FROM seller.shipping_template t
              JOIN seller.shop s ON s.id = t.shop_id
             WHERE s.merchant_id = :merchantId AND t.shop_id = :shopId
             ORDER BY t.id DESC
            """;

    /** 带上 {@code merchant_id}：归属判断不能靠调用方记得传对，得让这一行自己说它属于谁。 */
    private static final String FIND_ONE =
            """
            SELECT t.id, t.shop_id, s.merchant_id, s.name AS shop_name, t.name, t.charge_by, t.free_over,
                   CAST(t.regions AS text) AS regions, t.status, t.created_at, t.updated_at
              FROM seller.shipping_template t
              JOIN seller.shop s ON s.id = t.shop_id
             WHERE t.id = :id
            """;

    private static final String INSERT =
            """
            INSERT INTO seller.shipping_template (shop_id, name, charge_by, free_over, regions, status)
            VALUES (:shopId, :name, :chargeBy, :freeOver, CAST(:regions AS jsonb), :status)
            RETURNING id
            """;

    /**
     * {@code status <> 'archived'} 写在 where 里，不写在 service 的 if 里：
     * 两个人同时编辑同一条，先读后判会双双通过，库上这一句只有一个能改到。
     */
    private static final String UPDATE_CONTENT =
            """
            UPDATE seller.shipping_template
               SET name = :name, charge_by = :chargeBy, free_over = :freeOver,
                   regions = CAST(:regions AS jsonb)
             WHERE id = :id AND status <> 'archived'
            """;

    /**
     * 启用前先把同店的 active 归档。
     *
     * <p>必须<b>先</b>归档旧的再启新的：{@code uq_shipping_template_active} 是部分唯一索引，
     * 反过来的话新的一写就撞键。两句在同一个事务里，中途失败两边都不生效。
     */
    private static final String ARCHIVE_ACTIVE_OF_SHOP =
            """
            UPDATE seller.shipping_template
               SET status = 'archived'
             WHERE shop_id = :shopId AND status = 'active' AND id <> :id
            """;

    private static final String SET_STATUS =
            """
            UPDATE seller.shipping_template
               SET status = :status
             WHERE id = :id AND status <> 'archived'
            """;

    private static final RowMapper<TemplateRow> ROW = (rs, index) -> new TemplateRow(
            rs.getObject("id", UUID.class),
            rs.getObject("shop_id", UUID.class),
            rs.getObject("merchant_id", UUID.class),
            rs.getString("shop_name"),
            rs.getString("name"),
            FreightRule.ChargeBy.valueOf(rs.getString("charge_by").toUpperCase(Locale.ROOT)),
            rs.getObject("free_over", Long.class),
            rs.getString("regions"),
            ShippingTemplateStatus.from(rs.getString("status")),
            rs.getTimestamp("created_at") == null
                    ? null
                    : rs.getTimestamp("created_at").toInstant(),
            rs.getTimestamp("updated_at") == null
                    ? null
                    : rs.getTimestamp("updated_at").toInstant());

    private final JdbcClient jdbc;

    public ShippingTemplateStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    // —— 读 ——

    @Override
    public Optional<FreightRule> activeFor(UUID shopId) {
        return jdbc.sql(FIND_ACTIVE)
                .param("shopId", shopId)
                .query((rs, row) -> new FreightRule(
                        rs.getObject("id", UUID.class),
                        FreightRule.ChargeBy.valueOf(rs.getString("charge_by").toUpperCase(Locale.ROOT)),
                        rs.getObject("free_over", Long.class),
                        parseRegions(rs.getString("regions"))))
                .optional();
    }

    public List<TemplateRow> listByMerchant(UUID merchantId) {
        return jdbc.sql(LIST_BY_MERCHANT)
                .param("merchantId", merchantId)
                .query(ROW)
                .list();
    }

    public List<TemplateRow> listByShop(UUID merchantId, UUID shopId) {
        return jdbc.sql(LIST_BY_SHOP)
                .param("merchantId", merchantId)
                .param("shopId", shopId)
                .query(ROW)
                .list();
    }

    public Optional<TemplateRow> find(UUID id) {
        return jdbc.sql(FIND_ONE).param("id", id).query(ROW).optional();
    }

    // —— 写 ——

    public UUID insert(
            UUID shopId,
            String name,
            FreightRule.ChargeBy chargeBy,
            Long freeOver,
            List<FreightRule.Region> regions,
            ShippingTemplateStatus status) {
        return jdbc.sql(INSERT)
                .param("shopId", shopId)
                .param("name", name)
                .param("chargeBy", chargeBy.dbValue())
                .param("freeOver", freeOver)
                .param("regions", writeRegions(regions))
                .param("status", status.dbValue())
                .query(UUID.class)
                .single();
    }

    /** @return 影响行数；0 = 这条已经归档了（或者不存在），调用方据此报 409 */
    public int updateContent(
            UUID id, String name, FreightRule.ChargeBy chargeBy, Long freeOver, List<FreightRule.Region> regions) {
        return jdbc.sql(UPDATE_CONTENT)
                .param("id", id)
                .param("name", name)
                .param("chargeBy", chargeBy.dbValue())
                .param("freeOver", freeOver)
                .param("regions", writeRegions(regions))
                .update();
    }

    public int archiveActiveOfShop(UUID shopId, UUID keepId) {
        return jdbc.sql(ARCHIVE_ACTIVE_OF_SHOP)
                .param("shopId", shopId)
                .param("id", keepId)
                .update();
    }

    /** @return 影响行数；0 = 目标已归档或不存在 */
    public int setStatus(UUID id, ShippingTemplateStatus status) {
        return jdbc.sql(SET_STATUS)
                .param("id", id)
                .param("status", status.dbValue())
                .update();
    }

    private List<FreightRule.Region> parseRegions(String raw) {
        List<FreightRule.Region> parsed = JsonColumns.read(raw, new TypeReference<ArrayList<FreightRule.Region>>() {});
        return parsed == null ? List.of() : List.copyOf(parsed);
    }

    /**
     * 写回去的键名必须和读时一致（{@code areaCodes} 驼峰，不是 {@code area_codes}）：
     * 两个方向共用同一份 record 定义，改名会让库里出现两种形状，而读只认一种。
     */
    private String writeRegions(List<FreightRule.Region> regions) {
        return JsonColumns.write(regions);
    }

    /**
     * 库里的行，原样带出 {@code regions} 的 JSON 文本。
     *
     * <p>不在这一层解析成 {@link FreightRule.Region}：解析会抛异常，而列表页一条坏数据不该
     * 让整个列表 500。解析放在 service 里，坏数据能被单独标出来。
     */
    public record TemplateRow(
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
}
