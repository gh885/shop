package com.shop.platform.pricing.service;

import com.shop.platform.catalog.api.CatalogQuery;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.id.Ids;
import com.shop.platform.common.money.Money;
import com.shop.platform.infra.db.JsonColumns;
import com.shop.platform.pricing.api.PricingQuery;
import com.shop.platform.pricing.api.PricingRequest;
import com.shop.platform.pricing.dto.QuoteResponse;
import com.shop.platform.pricing.mapper.PriceQuoteMapper;
import com.shop.platform.promotion.api.PromotionQuery;
import com.shop.platform.seller.api.ShippingTemplateQuery;
import com.shop.platform.seller.api.ShopQuery;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 算价与落单校验的入口。
 *
 * <p>两条不能改的：
 *
 * <ul>
 *   <li><b>试算和落单同引擎、同规则版本</b>，落单必须带 {@code quoteId}
 *   <li><b>已成交订单的快照不可变</b>，后续改价、改规则都不影响它
 * </ul>
 *
 * <p>CAS 与插单必须同事务：先置 {@code used} 再让 trade 落单，插单失败就白烧一张报价。
 */
@Component
public class PriceQuoteService implements PricingQuery {

    /** 报价单有效期，与订单超时一致。 */
    static final Duration TTL = Duration.ofMinutes(30);

    private final QuoteCalculator calculator;

    private final PriceQuoteMapper quotes;

    private final ShopQuery shops;

    public PriceQuoteService(
            CatalogQuery catalog,
            PromotionQuery promotions,
            ShippingTemplateQuery templates,
            ShopQuery shops,
            PriceQuoteMapper quotes) {
        this.calculator = new QuoteCalculator(catalog, promotions, templates);
        this.shops = Objects.requireNonNull(shops, "shops");
        this.quotes = Objects.requireNonNull(quotes, "quotes");
    }

    /**
     * 试算：结算页。不写订单，只落一张报价单当证据。
     *
     * <p>响应带逐行明细与失效行：确认页整屏的金额事实来自这一份，明细从算价当场的内存结果组装——
     * 读侧绝不重算，重算会撞上「规则已改」的竞态，和落单核销的快照漂移。
     */
    @Transactional
    public QuoteResponse quote(PricingRequest request) {
        QuoteCalculator.Result result = calculator.calculate(request);
        UUID quoteId = Ids.newId();
        Instant expiresAt = Instant.now().plus(TTL);

        // 失效行从未参与算价：指纹与证据都只认可售行。这样「用户剔除失效行后下单」指纹才对得上；
        // 反过来带着失效行下单会被指纹拦下（PRICE_CHANGED），前端漏剔除也兜得住
        Set<Integer> liveLineNos = result.lines().stream()
                .map(QuoteCalculator.ComputedLine::lineNo)
                .collect(Collectors.toSet());
        List<PricingRequest.Line> effectiveLines = request.lines().stream()
                .filter(line -> liveLineNos.contains(line.lineNo()))
                .toList();
        PricingRequest effective =
                new PricingRequest(request.buyerId(), request.address(), effectiveLines, request.entitlements());

        List<UUID> ruleIds = result.outcomes().stream()
                .filter(outcome -> !"skipped".equals(outcome.outcome()))
                .map(outcome -> outcome.rule().ruleId())
                .toList();

        quotes.insertQuote(
                quoteId,
                request.buyerId(),
                fingerprint(effective),
                writeJson(effective.address()),
                writeJson(effective.entitlements()),
                result,
                ruleIds,
                expiresAt);

        return toResponse(quoteId, expiresAt, result);
    }

    /** 明细组装：按店铺分组（与拆子单维度一致），同一份内存结果既落证据又出响应，两者天然一致 */
    private QuoteResponse toResponse(UUID quoteId, Instant expiresAt, QuoteCalculator.Result result) {
        String currency = result.currency();
        Map<UUID, List<QuoteCalculator.ComputedLine>> byShop = new LinkedHashMap<>();
        for (QuoteCalculator.ComputedLine line : result.lines()) {
            byShop.computeIfAbsent(line.shopId(), key -> new ArrayList<>()).add(line);
        }
        Map<UUID, Long> shippingByShop = new LinkedHashMap<>();
        for (QuoteCalculator.MerchantShipping shipping : result.shipping()) {
            shippingByShop.put(shipping.shopId(), shipping.amount());
        }

        List<QuoteResponse.Group> groups = new ArrayList<>(byShop.size());
        for (Map.Entry<UUID, List<QuoteCalculator.ComputedLine>> entry : byShop.entrySet()) {
            UUID shopId = entry.getKey();
            List<QuoteCalculator.ComputedLine> shopLines = entry.getValue();
            UUID merchantId = shopLines.getFirst().merchantId();
            long shipping = shippingByShop.getOrDefault(shopId, 0L);
            List<QuoteResponse.Line> lines = shopLines.stream()
                    .map(line -> new QuoteResponse.Line(
                            line.lineNo(),
                            line.listingId(),
                            line.skuId(),
                            line.spuId(),
                            line.title(),
                            line.imageUrl(),
                            line.specValuesJson() == null ? "{}" : line.specValuesJson(),
                            line.quantity(),
                            new Money(line.unitAmount(), currency),
                            new Money(line.subtotal(), currency),
                            new Money(line.discountAmount(), currency),
                            new Money(line.payableAmount(), currency)))
                    .toList();
            groups.add(new QuoteResponse.Group(
                    shopId, merchantId, shops.nameOf(shopId).orElse(null), new Money(shipping, currency), lines));
        }

        List<QuoteResponse.UnavailableLine> unavailable = result.unavailable().stream()
                .map(line -> new QuoteResponse.UnavailableLine(line.lineNo(), line.skuId(), line.cause()))
                .toList();

        return new QuoteResponse(
                quoteId,
                expiresAt,
                new Money(result.goodsAmount(), currency),
                new Money(result.discountAmount(), currency),
                new Money(result.shippingAmount(), currency),
                new Money(result.payableAmount(), currency),
                groups,
                unavailable);
    }

    /**
     * 落单时验证报价单。校验通过后返回总额，**并把它置为 used**。
     *
     * <p>必须在 trade 的下单事务里调用：{@code consume} 是 CAS，影响 0 行就说明这张报价刚被别的请求用掉了，
     * 直接拒单。这就是下单幂等的天然锚点。
     *
     * @param current 当前购物车快照。与报价时的输入不一致就返回 {@code PRICE_CHANGED}
     * @throws BusinessException {@code QUOTE_EXPIRED}（报价没了）或 {@code PRICE_CHANGED}（价变了）
     */
    @Transactional
    public QuoteSnapshot consumeForOrder(UUID quoteId, PricingRequest current) {
        PriceQuoteMapper.QuoteRow quote = quotes.find(quoteId)
                .orElseThrow(() -> BusinessException.conflict(ErrorCodes.QUOTE_EXPIRED, "报价单不存在: " + quoteId));

        if (!"issued".equals(quote.status()) || !quote.expiresAt().isAfter(Instant.now())) {
            throw BusinessException.conflict(ErrorCodes.QUOTE_EXPIRED, "报价单已过期或已被使用: " + quoteId);
        }

        String currentFingerprint = fingerprint(current);
        if (!currentFingerprint.equals(quote.fingerprint())) {
            // 不能悄悄用新价：结算页显示 99、扣款 109 是投诉里最难解释的一类
            throw BusinessException.conflict(ErrorCodes.PRICE_CHANGED, "商品、数量、地址或规则已变，请重新确认价格");
        }

        if (!quotes.consume(quoteId)) {
            throw BusinessException.conflict(ErrorCodes.QUOTE_EXPIRED, "报价单刚被别的请求用掉了: " + quoteId);
        }

        // 明细从证据表读回来，不在内存里重新算：trade 要的是"当时钉住了什么"
        List<PriceQuoteMapper.RuleRow> rules = quotes.findRules(quoteId);
        List<LineSnapshot> lineSnapshots = quotes.findLines(quoteId).stream()
                .map(line -> new LineSnapshot(
                        line.lineNo(),
                        line.listingId(),
                        line.skuId(),
                        line.spuId(),
                        line.merchantId(),
                        line.shopId(),
                        line.categoryId(),
                        line.brandId(),
                        line.quantity(),
                        new Money(line.unitAmount(), quote.currency()),
                        line.weightG(),
                        line.title(),
                        line.imageUrl(),
                        line.specValuesJson(),
                        line.identityKey(),
                        line.sevenDayReturn(),
                        new Money(line.subtotal(), quote.currency()),
                        new Money(line.discountAmount(), quote.currency()),
                        new Money(line.payableAmount(), quote.currency()),
                        discountsOn(line.lineNo(), rules, quote.currency())))
                .toList();

        List<ShippingSnapshot> shippingSnapshots = quotes.findShipping(quoteId).stream()
                .map(row ->
                        new ShippingSnapshot(null, row.merchantId(), new Money(row.shippingAmount(), quote.currency())))
                .toList();

        return new QuoteSnapshot(
                quote.id(),
                quote.currency(),
                new Money(quote.goodsAmount(), quote.currency()),
                new Money(quote.discountAmount(), quote.currency()),
                new Money(quote.shippingAmount(), quote.currency()),
                new Money(quote.payableAmount(), quote.currency()),
                lineSnapshots,
                shippingSnapshots);
    }

    /**
     * 某一行在每条规则下分到了多少。
     *
     * <p>分摊矩阵的 key 是 {@code line_no} 的字符串形式（jsonb 的 object key 只能是字符串）。
     * 为 0 的行不返回：{@code order_line_discount} 有 {@code amount > 0} 的约束。
     */
    private static List<DiscountSnapshot> discountsOn(
            int lineNo, List<PriceQuoteMapper.RuleRow> rules, String currency) {
        List<DiscountSnapshot> result = new java.util.ArrayList<>();
        for (PriceQuoteMapper.RuleRow rule : rules) {
            Long amount = rule.allocation().get(String.valueOf(lineNo));
            if (amount != null && amount > 0) {
                result.add(new DiscountSnapshot(
                        rule.ruleId(), rule.ruleVersion(), rule.type(), rule.bearer(), new Money(amount, currency)));
            }
        }
        return List.copyOf(result);
    }

    /**
     * 规范化输入的摘要。
     *
     * <p>行按 {@code skuId} 排序、地址归一、资格列表排序，一起做 SHA-256。
     * 不做归一，两次一模一样的请求会算出两个不同的指纹，用户就会被莫名要求重新确认。
     *
     * <p><b>只算「买家能改的东西」：SKU、数量、行号、地址、资格。</b> {@code listingId} 和
     * {@code merchantId} 是可选校验位，不进指纹——它们由 catalog 决定，买家改不了；
     * 算进去会让"算价时没传、下单时传了"这种无关紧要的差别变成一次 {@code PRICE_CHANGED}，
     * 而用户看到的数字一个都没变。
     */
    static String fingerprint(PricingRequest request) {
        String canonical = request.lines().stream()
                .sorted(Comparator.comparing(
                                (PricingRequest.Line line) -> line.skuId().toString())
                        .thenComparingInt(PricingRequest.Line::lineNo))
                .map(line -> line.lineNo() + ":" + line.skuId() + "x" + line.quantity())
                .collect(Collectors.joining(","));

        PricingRequest.Address address = request.address();
        String addr = address == null
                ? "-"
                : nullToDash(address.provinceCode()) + "/" + nullToDash(address.cityCode()) + "/"
                        + nullToDash(address.districtCode());

        String entitlements = request.entitlements().stream()
                .map(item -> item.kind() + ":" + item.refId())
                .sorted()
                .collect(Collectors.joining(","));

        return sha256(request.buyerId() + "|" + canonical + "|" + addr + "|" + entitlements);
    }

    private static String nullToDash(String value) {
        return value == null || value.isBlank() ? "-" : value;
    }

    private static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("JDK 必须有 SHA-256", e);
        }
    }

    private String writeJson(Object value) {
        return value == null ? "null" : JsonColumns.write(value);
    }
}
