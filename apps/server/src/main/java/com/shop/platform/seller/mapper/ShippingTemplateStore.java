package com.shop.platform.seller.mapper;

import com.shop.platform.seller.api.FreightRule;
import com.shop.platform.seller.api.ShippingTemplateQuery;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * 运费模板的读取。表在 {@code seller} schema，只有这里读它。
 *
 * <p>只读、只返回值对象。地区匹配和金额计算<b>不在这里</b>——那要看折后金额，是算价的事，
 * 见 {@code pricing.model.FreightFee}。这个类一旦开始算钱，就又把两个模块粘回去了。
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

    private final JdbcClient jdbc;

    private final ObjectMapper json = JsonMapper.builder().build();

    public ShippingTemplateStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /**
     * {@code regions} 是 jsonb 数组，{@code DataClassRowMapper} 不认，所以这一行手写映射。
     * 它只有一个字段要解析，解析逻辑本来就在这个类里。
     */
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

    private List<FreightRule.Region> parseRegions(String raw) {
        List<FreightRule.Region> parsed = json.readValue(raw, new TypeReference<ArrayList<FreightRule.Region>>() {});
        return parsed == null ? List.of() : List.copyOf(parsed);
    }
}
