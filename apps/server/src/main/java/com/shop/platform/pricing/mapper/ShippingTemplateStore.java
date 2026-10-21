package com.shop.platform.pricing.mapper;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * 运费模板的读取。
 *
 * <p>地区匹配在这里做，不在 SQL 里：{@code regions} 是 jsonb 数组，用 SQL 展开判断既难读又没法解释
 * "为什么这条命中了"。模板是低频数据（一个店一条），读出来在内存里按层级深度降序匹配完全够用。
 */
@Component
public class ShippingTemplateStore {

    private static final String FIND_ACTIVE =
            """
            SELECT id, shop_id, charge_by, free_over, regions::text AS regions
              FROM pricing.shipping_template
             WHERE shop_id = ? AND status = 'active'
            """;

    private final JdbcTemplate jdbc;

    private final ObjectMapper json = JsonMapper.builder().build();

    public ShippingTemplateStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /**
     * 取店铺的启用模板。
     *
     * <p>用 {@code shop_id} 而不是 {@code merchant_id}：模板归店铺，而 {@code shopId} 由 catalog 的 offer 带过来，
     * 算价不需要知道商家和店铺的映射关系——那属于 seller 的知识，跨过来查就是越界。
     */
    public Optional<TemplateRow> findActiveByShop(UUID shopId) {
        return jdbc
                .query(
                        FIND_ACTIVE,
                        (rs, row) -> new TemplateRow(
                                rs.getObject("id", UUID.class),
                                rs.getObject("shop_id", UUID.class),
                                rs.getString("charge_by"),
                                rs.getObject("free_over", Long.class),
                                parseRegions(rs.getString("regions"))),
                        shopId)
                .stream()
                .findFirst();
    }

    private List<Region> parseRegions(String raw) {
        List<Region> parsed = json.readValue(raw, new TypeReference<ArrayList<Region>>() {});
        return parsed == null ? List.of() : List.copyOf(parsed);
    }

    /**
     * @param areaCodes 地区编码；空数组是默认项，所有具体地区都没命中时用它
     * @param first 首件（首重）数量或重量
     * @param additional 续件（续重）数量或重量
     */
    public record Region(List<String> areaCodes, long first, long firstFee, long additional, long additionalFee) {

        public Region {
            areaCodes = areaCodes == null ? List.of() : List.copyOf(areaCodes);
        }

        boolean isDefault() {
            return areaCodes.isEmpty();
        }
    }

    public record TemplateRow(UUID id, UUID shopId, String chargeBy, Long freeOver, List<Region> regions) {

        /**
         * 按 (地区, 计费量) 算运费。
         *
         * <p>三条运行期规则：
         *
         * <ol>
         *   <li>地区匹配取最具体的：按 {@code areaCodes} 层级深度降序，第一条命中的生效
         *   <li>都没命中用默认项（{@code areaCodes: []}）
         *   <li>首件（重）价 + 超出部分按续件（重）价
         * </ol>
         */
        public long feeFor(String districtCode, long amount) {
            Region matched = match(districtCode);
            if (matched == null) {
                // 没有默认项就不该被启用，这里抛是为了一眼看到配置错了
                throw new IllegalStateException("运费模板缺少默认地区项: " + id);
            }
            if (amount <= matched.first()) {
                return matched.firstFee();
            }
            long extra = amount - matched.first();
            long steps = (extra + matched.additional() - 1) / matched.additional();
            return matched.firstFee() + steps * matched.additionalFee();
        }

        private Region match(String districtCode) {
            if (districtCode != null) {
                Optional<Region> specific = regions.stream()
                        .filter(region -> !region.isDefault())
                        .filter(region -> region.areaCodes().contains(districtCode))
                        .max(Comparator.comparingInt(
                                region -> depth(region.areaCodes().getFirst())));
                if (specific.isPresent()) {
                    return specific.get();
                }
            }
            return regions.stream().filter(Region::isDefault).findFirst().orElse(null);
        }

        /** 行政区划编码按 2 位一段：省 2 / 市 4 / 区 6。层级深度就是它的具体程度。 */
        private static int depth(String code) {
            return code == null ? 0 : code.length();
        }
    }
}
