package com.shop.platform.pricing.mapper;

import com.shop.platform.infra.db.RowMappers;
import com.shop.platform.pricing.service.QuoteCalculator;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * 报价单及其四张明细表的写入与点查。
 *
 * <p>所有 INSERT 都写全量证据：只存结果不存输入，投诉"运费为什么是 12 块"时还是查不清。
 */
@Component
public class PriceQuoteStore {

    private static final String INSERT_QUOTE =
            """
            INSERT INTO pricing.price_quote
                (id, buyer_id, status, fingerprint, ship_address, entitlements, currency,
                 goods_amount, discount_amount, shipping_amount, payable_amount, rule_ids, expires_at)
            VALUES (:id, :buyerId, 'issued', :fingerprint, CAST(:shipAddress AS jsonb),
                    CAST(:entitlements AS jsonb), :currency, :goodsAmount, :discountAmount,
                    :shippingAmount, :payableAmount, CAST(:ruleIds AS uuid[]), :expiresAt)
            """;

    private static final String INSERT_LINE =
            """
            INSERT INTO pricing.price_quote_line
                (quote_id, line_no, offer_id, sku_id, merchant_id, shop_id, quantity, unit_amount,
                 weight_g, subtotal, discount_amount, payable,
                 spu_id, category_id, brand_id, title, image_url, spec_values, identity_key)
            VALUES (:quoteId, :lineNo, :offerId, :skuId, :merchantId, :shopId, :quantity, :unitAmount,
                    :weightG, :subtotal, :discountAmount, :payable,
                    :spuId, :categoryId, :brandId, :title, :imageUrl, CAST(:specValues AS jsonb), :identityKey)
            """;

    private static final String INSERT_RULE =
            """
            INSERT INTO pricing.price_quote_rule
                (quote_id, rule_id, rule_version, type, scope, bearer, outcome,
                 base_amount, threshold, requested_amount, amount, allocation)
            VALUES (:quoteId, :ruleId, :ruleVersion, :type, :scope, :bearer, :outcome,
                    :baseAmount, :threshold, :requestedAmount, :amount, CAST(:allocation AS jsonb))
            """;

    private static final String INSERT_SHIPPING =
            """
            INSERT INTO pricing.price_quote_shipping
                (quote_id, merchant_id, template_id, charge_by, weight_g, shipping_amount, free_applied)
            VALUES (:quoteId, :merchantId, :templateId, :chargeBy, :weightG, :shippingAmount, :freeApplied)
            """;

    /**
     * 落单时的 CAS。影响 0 行 = 这张报价刚被别的请求用掉了，拒单。
     *
     * <p>必须和插单在同一个事务，不能先置 used 再让 trade 落单——插单失败就白烧一张报价。
     */
    private static final String CONSUME =
            """
            UPDATE pricing.price_quote SET status = 'used'
             WHERE id = :id AND status = 'issued' AND expires_at > now()
            """;

    private static final String FIND =
            """
            SELECT id, buyer_id, status, fingerprint, currency,
                   goods_amount, discount_amount, shipping_amount, payable_amount, expires_at
              FROM pricing.price_quote
             WHERE id = :id
            """;

    private static final String FIND_LINES =
            """
            SELECT line_no, offer_id, sku_id, spu_id, merchant_id, shop_id, category_id, brand_id,
                   quantity, unit_amount, weight_g, subtotal, discount_amount, payable,
                   title, image_url, CAST(spec_values AS text) AS spec_values_json, identity_key
              FROM pricing.price_quote_line
             WHERE quote_id = :quoteId
             ORDER BY line_no
            """;

    /** 只捞真减了钱的规则：skipped 的 allocation 是 null，也进不了分红。 */
    private static final String FIND_RULES =
            """
            SELECT rule_id, rule_version, type, bearer, CAST(allocation AS text) AS allocation
              FROM pricing.price_quote_rule
             WHERE quote_id = :quoteId AND outcome IN ('applied', 'truncated') AND allocation IS NOT NULL
            """;

    private static final String FIND_SHIPPING =
            """
            SELECT merchant_id, shipping_amount
              FROM pricing.price_quote_shipping
             WHERE quote_id = :quoteId
             ORDER BY merchant_id
            """;

    private static final RowMapper<QuoteRow> QUOTE_MAPPER = RowMappers.of(QuoteRow.class);

    private static final RowMapper<LineRow> LINE_MAPPER = RowMappers.of(LineRow.class);

    private static final RowMapper<ShippingRow> SHIPPING_MAPPER = RowMappers.of(ShippingRow.class);

    private final JdbcClient jdbc;

    private final ObjectMapper json = JsonMapper.builder().build();

    public PriceQuoteStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insertQuote(
            UUID quoteId,
            UUID buyerId,
            String fingerprint,
            String shipAddress,
            String entitlements,
            QuoteCalculator.Result result,
            List<UUID> ruleIds,
            Instant expiresAt) {
        jdbc.sql(INSERT_QUOTE)
                .param("id", quoteId)
                .param("buyerId", buyerId)
                .param("fingerprint", fingerprint)
                .param("shipAddress", shipAddress)
                .param("entitlements", entitlements)
                .param("currency", result.currency())
                .param("goodsAmount", result.goodsAmount())
                .param("discountAmount", result.discountAmount())
                .param("shippingAmount", result.shippingAmount())
                .param("payableAmount", result.payable())
                .param("ruleIds", toUuidArray(ruleIds))
                .param("expiresAt", RowMappers.toDb(expiresAt))
                .update();

        for (QuoteCalculator.ComputedLine line : result.lines()) {
            jdbc.sql(INSERT_LINE)
                    .param("quoteId", quoteId)
                    .param("lineNo", line.lineNo())
                    .param("offerId", line.offerId())
                    .param("skuId", line.skuId())
                    .param("merchantId", line.merchantId())
                    .param("shopId", line.shopId())
                    .param("quantity", line.quantity())
                    .param("unitAmount", line.unitAmount())
                    .param("weightG", line.weightG())
                    .param("subtotal", line.subtotal())
                    .param("discountAmount", line.discountAmount())
                    .param("payable", line.payable())
                    .param("spuId", line.spuId())
                    .param("categoryId", line.categoryId())
                    .param("brandId", line.brandId())
                    .param("title", line.title())
                    .param("imageUrl", line.imageUrl())
                    .param("specValues", line.specValuesJson() == null ? "{}" : line.specValuesJson())
                    .param("identityKey", line.identityKey())
                    .update();
        }

        for (QuoteCalculator.RuleOutcome outcome : result.outcomes()) {
            jdbc.sql(INSERT_RULE)
                    .param("quoteId", quoteId)
                    .param("ruleId", outcome.rule().ruleId())
                    .param("ruleVersion", outcome.rule().ruleVersion())
                    .param("type", outcome.rule().type())
                    .param("scope", outcome.rule().scope().name().toLowerCase(Locale.ROOT))
                    .param("bearer", outcome.rule().bearer().name().toLowerCase(Locale.ROOT))
                    .param("outcome", outcome.outcome())
                    .param("baseAmount", outcome.baseAmount())
                    .param("threshold", outcome.rule().threshold())
                    .param("requestedAmount", outcome.requestedAmount())
                    .param("amount", outcome.amount())
                    .param(
                            "allocation",
                            outcome.allocation() == null ? null : json.writeValueAsString(outcome.allocation()))
                    .update();
        }

        for (QuoteCalculator.MerchantShipping shipping : result.shipping()) {
            jdbc.sql(INSERT_SHIPPING)
                    .param("quoteId", quoteId)
                    .param("merchantId", shipping.merchantId())
                    .param("templateId", shipping.templateId())
                    .param("chargeBy", shipping.chargeBy())
                    .param("weightG", shipping.weightG())
                    .param("shippingAmount", shipping.amount())
                    .param("freeApplied", shipping.freeApplied())
                    .update();
        }
    }

    public Optional<QuoteRow> find(UUID quoteId) {
        return jdbc.sql(FIND).param("id", quoteId).query(QUOTE_MAPPER).optional();
    }

    /** false = 这张报价已经 used 或过期了。 */
    public boolean consume(UUID quoteId) {
        return jdbc.sql(CONSUME).param("id", quoteId).update() == 1;
    }

    /** 逐行金额，按 {@code line_no} 升序。 */
    public List<LineRow> findLines(UUID quoteId) {
        return jdbc.sql(FIND_LINES).param("quoteId", quoteId).query(LINE_MAPPER).list();
    }

    /**
     * 分摊矩阵，按 {@code line_no} 归到每条规则下。
     *
     * <p>{@code allocation} 存成 jsonb 而不是独立表——它是整体证据，从不单独查询。这里读出来转成
     * {@code Map<Integer, Long>}，交给调用方按行贴。这个字段要 JSON 解析，所以映射器手写。
     */
    public List<RuleRow> findRules(UUID quoteId) {
        return jdbc.sql(FIND_RULES)
                .param("quoteId", quoteId)
                .query((rs, row) -> new RuleRow(
                        rs.getObject("rule_id", UUID.class),
                        rs.getString("rule_version"),
                        rs.getString("type"),
                        rs.getString("bearer"),
                        json.readValue(
                                rs.getString("allocation"), new TypeReference<LinkedHashMap<String, Long>>() {})))
                .list();
    }

    public List<ShippingRow> findShipping(UUID quoteId) {
        return jdbc.sql(FIND_SHIPPING)
                .param("quoteId", quoteId)
                .query(SHIPPING_MAPPER)
                .list();
    }

    /**
     * Postgres 的 {@code uuid[]} 用文本字面量传，比纠结 {@code setArray} 的驱动差异稳。
     *
     * <p>注意不能直接传 {@code List<UUID>} 配 {@code ::uuid[]}：命名参数里 {@code :x::type} 的
     * 双冒号会被当成两个占位符。这里传 {@code '{...}'} 字面量，SQL 里是 {@code CAST(:x AS uuid[])}。
     */
    private static String toUuidArray(List<UUID> ids) {
        if (ids.isEmpty()) {
            return "{}";
        }
        return "{"
                + ids.stream()
                        .map(UUID::toString)
                        .reduce((left, right) -> left + "," + right)
                        .orElse("") + "}";
    }

    public record LineRow(
            int lineNo,
            UUID offerId,
            UUID skuId,
            UUID spuId,
            UUID merchantId,
            UUID shopId,
            UUID categoryId,
            UUID brandId,
            int quantity,
            long unitAmount,
            Integer weightG,
            long subtotal,
            long discountAmount,
            long payable,
            String title,
            String imageUrl,
            String specValuesJson,
            String identityKey) {}

    public record RuleRow(UUID ruleId, String ruleVersion, String type, String bearer, Map<String, Long> allocation) {}

    public record ShippingRow(UUID merchantId, long shippingAmount) {}

    public record QuoteRow(
            UUID id,
            UUID buyerId,
            String status,
            String fingerprint,
            String currency,
            long goodsAmount,
            long discountAmount,
            long shippingAmount,
            long payableAmount,
            Instant expiresAt) {

        public Map<String, Object> totals() {
            return Map.of(
                    "goods", goodsAmount,
                    "discount", discountAmount,
                    "shipping", shippingAmount,
                    "payable", payableAmount);
        }
    }
}
