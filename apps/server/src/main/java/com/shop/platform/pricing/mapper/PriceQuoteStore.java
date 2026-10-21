package com.shop.platform.pricing.mapper;

import com.shop.platform.pricing.service.QuoteCalculator;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;
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
            VALUES (?, ?, 'issued', ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?, ?, ?::uuid[], ?)
            """;

    private static final String INSERT_LINE =
            """
            INSERT INTO pricing.price_quote_line
                (quote_id, line_no, offer_id, sku_id, merchant_id, quantity, unit_amount,
                 weight_g, subtotal, discount_amount, payable)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """;

    private static final String INSERT_RULE =
            """
            INSERT INTO pricing.price_quote_rule
                (quote_id, rule_id, rule_version, type, scope, bearer, outcome,
                 base_amount, threshold, requested_amount, amount, allocation)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
            """;

    private static final String INSERT_SHIPPING =
            """
            INSERT INTO pricing.price_quote_shipping
                (quote_id, merchant_id, template_id, charge_by, weight_g, shipping_amount, free_applied)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """;

    /**
     * 落单时的 CAS。影响 0 行 = 这张报价刚被别的请求用掉了，拒单。
     *
     * <p>必须和插单在同一个事务，不能先置 used 再让 trade 落单——插单失败就白烧一张报价。
     */
    private static final String CONSUME =
            """
            UPDATE pricing.price_quote SET status = 'used'
             WHERE id = ? AND status = 'issued' AND expires_at > now()
            """;

    private static final String FIND =
            """
            SELECT id, buyer_id, status, fingerprint, currency,
                   goods_amount, discount_amount, shipping_amount, payable_amount, expires_at
              FROM pricing.price_quote
             WHERE id = ?
            """;

    private static final RowMapper<QuoteRow> MAPPER = (rs, row) -> new QuoteRow(
            rs.getObject("id", UUID.class),
            rs.getObject("buyer_id", UUID.class),
            rs.getString("status"),
            rs.getString("fingerprint"),
            rs.getString("currency"),
            rs.getLong("goods_amount"),
            rs.getLong("discount_amount"),
            rs.getLong("shipping_amount"),
            rs.getLong("payable_amount"),
            rs.getTimestamp("expires_at").toInstant());

    private final JdbcTemplate jdbc;

    private final ObjectMapper json = JsonMapper.builder().build();

    public PriceQuoteStore(JdbcTemplate jdbc) {
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
        jdbc.update(
                INSERT_QUOTE,
                quoteId,
                buyerId,
                fingerprint,
                shipAddress,
                entitlements,
                result.currency(),
                result.goodsAmount(),
                result.discountAmount(),
                result.shippingAmount(),
                result.payable(),
                toUuidArray(ruleIds),
                Timestamp.from(expiresAt));

        for (QuoteCalculator.ComputedLine line : result.lines()) {
            jdbc.update(
                    INSERT_LINE,
                    quoteId,
                    line.lineNo(),
                    line.offerId(),
                    line.skuId(),
                    line.merchantId(),
                    line.quantity(),
                    line.unitAmount(),
                    line.weightG(),
                    line.subtotal(),
                    line.discountAmount(),
                    line.payable());
        }

        for (QuoteCalculator.RuleOutcome outcome : result.outcomes()) {
            jdbc.update(
                    INSERT_RULE,
                    quoteId,
                    outcome.rule().ruleId(),
                    outcome.rule().ruleVersion(),
                    outcome.rule().type(),
                    outcome.rule().scope().name().toLowerCase(java.util.Locale.ROOT),
                    outcome.rule().bearer().name().toLowerCase(java.util.Locale.ROOT),
                    outcome.outcome(),
                    outcome.baseAmount(),
                    outcome.rule().threshold(),
                    outcome.requestedAmount(),
                    outcome.amount(),
                    outcome.allocation() == null ? null : json.writeValueAsString(outcome.allocation()));
        }

        for (QuoteCalculator.MerchantShipping shipping : result.shipping()) {
            jdbc.update(
                    INSERT_SHIPPING,
                    quoteId,
                    shipping.merchantId(),
                    shipping.templateId(),
                    shipping.chargeBy(),
                    shipping.weightG(),
                    shipping.amount(),
                    shipping.freeApplied());
        }
    }

    public Optional<QuoteRow> find(UUID quoteId) {
        return jdbc.query(FIND, MAPPER, quoteId).stream().findFirst();
    }

    /** false = 这张报价已经 used 或过期了。 */
    public boolean consume(UUID quoteId) {
        return jdbc.update(CONSUME, quoteId) == 1;
    }

    /** Postgres 的 {@code uuid[]} 用文本字面量传，比纠结 {@code setArray} 的驱动差异稳。 */
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
