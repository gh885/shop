package com.shop.platform.catalog.service;

import com.shop.platform.catalog.model.CategoryConfig;
import com.shop.platform.catalog.model.IdentityKind;
import com.shop.platform.catalog.model.ValueType;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 识别键的计算。<b>全项目唯一决定"怎么认商品"的地方。</b>
 *
 * <p>两级键，用途不同，不要合并：
 *
 * <ul>
 *   <li>{@code spu.match_key} —— 建标准品、认"这是不是同一个商品"
 *   <li>{@code sku.identity_key} —— 比价、售后认"这是不是同一个规格"
 * </ul>
 *
 * <p><b>规范化做在写入侧，不做在匹配侧。</b> 哈希只负责把已经规范化的值拼起来，不承担清洗。
 * "TypeC" / "Type-C" / "USB-C" 是三个值，三条商品就成了三个同款——这类脏数据一旦写进去，
 * 只能人工一条条修，所以必须挡在写入时。
 *
 * <p><b>归一化但不换算单位。</b> {@code 1m} 和 {@code 100cm} 算两个值：换算是业务判断
 * （"1 米数据线"和"100 厘米数据线"在电商里可能真是两个 SKU），而且换算表要维护。
 * 归一化只做大小写和空白：{@code 1M} 和 {@code 1m} 是同一个，{@code red } 和 {@code red} 是同一个。
 * 真正防住"同款不同写法"的是值域（{@code enum}）——运营定死有哪几档，商家只能选。
 */
@Component
public class IdentityKeyResolver {

    /**
     * 算 SPU 级识别键。
     *
     * <p>类目给的是候选列表（{@code identity_keys}），实际用哪个由<b>优先级</b>和商家填了什么共同决定：
     *
     * <ul>
     *   <li>{@code match_strategies} 是运营显式定的优先级。配了就按它，没配就按 {@code identity_keys} 的声明顺序
     *   <li>按优先级往下试：填了型号 → {@code 品牌:型号}；填了款号 → {@code 品牌:款号}；能拼参数 → {@code 品牌:参数哈希}
     *   <li>都不匹配或类目声明 {@code none} → null（白牌非标，挂不上标准品）
     * </ul>
     *
     * <p><b>为什么要有 {@code match_strategies}。</b> 一个类目可能同时声明 {@code model_no} 和
     * {@code param_hash}——同一个格子里品牌货和白牌货并存。哪个说了算必须是运营定的：
     * 白牌标品类目要把 {@code param_hash} 放前面，否则填了型号的白牌货会按型号归并，
     * 而型号是商家自己编的，全平台各编各的，归并出来是一堆单例标准品。
     * 这个字段之前在库里存着、接口里收着，一行都没被读过——又一个"配了不生效"。
     *
     * <p>品牌名进键是必须的：两个品牌同型号（都叫 {@code A3294}）会被
     * {@code uq_spu_standard_match} 判成重复，而它们显然不是同一个东西。
     *
     * @param brandName 品牌名。没有品牌时用空串——白牌货靠参数哈希区分
     */
    public ResolvedIdentity resolveSpu(
            CategoryConfig config, String modelNo, String brandName, Map<UUID, String> attributeValues) {
        Objects.requireNonNull(config, "config");

        // none 优先：类目明说"认不出来"，就别猜
        if (config.identityKeys().contains(IdentityKind.NONE.dbValue())) {
            return ResolvedIdentity.none();
        }

        String brand = normalize(brandName);

        for (IdentityKind kind : priority(config)) {
            switch (kind) {
                case MODEL_NO, ARTICLE_NO -> {
                    if (hasText(modelNo)) {
                        // 款号和型号在库里是同一列（model_no），靠 identity_kind 区分语义
                        return new ResolvedIdentity(kind, brand + ":" + normalize(modelNo));
                    }
                }
                case PARAM_HASH -> {
                    String hash = paramHash(config, attributeValues);
                    if (hash != null) {
                        return new ResolvedIdentity(kind, brand + ":" + hash);
                    }
                }
                case NONE -> {
                    // 上面已经返回了，走到这里说明 identity_keys 里混了 none，
                    // 而那种配置在建类目时就被拒（none 不能和其他键并存）
                }
            }
        }
        return ResolvedIdentity.none();
    }

    /**
     * 识别键的试用顺序。
     *
     * <p>{@code identity_keys} 是"允许哪些"，{@code match_strategies} 是"先试哪个"。
     * 两者交集、按 {@code match_strategies} 排；策略为空时退回 {@code identity_keys} 的声明顺序
     * （老配置没配策略，不能因此认不出商品）。
     */
    private static List<IdentityKind> priority(CategoryConfig config) {
        Set<String> allowed = new HashSet<>(config.identityKeys());
        List<String> order = config.matchStrategies().isEmpty() ? config.identityKeys() : config.matchStrategies();
        List<IdentityKind> result = new ArrayList<>();
        for (String key : order) {
            IdentityKind kind = IdentityKind.from(key);
            if (allowed.contains(key) && !result.contains(kind)) {
                result.add(kind);
            }
        }
        return List.copyOf(result);
    }

    /**
     * 算 SKU 级识别键。
     *
     * <p>GTIN 优先：它是国际通用的规格条码，一个颜色容量组合一个。
     * 没有 GTIN 而类目允许参数哈希时，退化为规格属性的参数哈希——这样白牌标品
     * 也能比价（同参数不同商家）。
     *
     * @return null = 认不出来（{@code none} 或该给的都没给）
     */
    public String resolveSku(CategoryConfig config, String barcode, Map<UUID, String> specValues) {
        Objects.requireNonNull(config, "config");

        if (config.skuIdentityKinds().contains(IdentityKind.NONE.dbValue())) {
            return null;
        }
        if (config.skuIdentityKinds().contains("gtin") && hasText(barcode)) {
            return normalize(barcode);
        }
        if (config.skuIdentityKinds().contains("param_hash")) {
            return specHash(config, specValues);
        }
        return null;
    }

    /**
     * 规格属性的参数哈希：按属性 code 排序拼接，保证同一组值不管传参顺序都得到同一个键。
     *
     * <p>规格值和 SPU 属性值分开算：规格是"买哪一个"（颜色/尺码），属性是"这是什么"（材质/产地）。
     * 混在一起会让"红色 1m"和"1m 红色"取决于前端传参顺序。
     */
    private String specHash(CategoryConfig config, Map<UUID, String> specValues) {
        if (specValues == null || specValues.isEmpty()) {
            return null;
        }
        Map<UUID, CategoryConfig.AttributeView> byId = index(config);
        Map<String, String> canonical = new LinkedHashMap<>();
        for (Map.Entry<UUID, String> entry : specValues.entrySet()) {
            CategoryConfig.AttributeView attribute = byId.get(entry.getKey());
            if (attribute == null || !hasText(entry.getValue())) {
                continue;
            }
            canonical.put(attribute.code(), canonicalValue(attribute, entry.getValue()));
        }
        if (canonical.isEmpty()) {
            return null;
        }
        return join(canonical);
    }

    /** SPU 级参数哈希：只取 {@code is_identity} 的属性，按 code 排序拼接。 */
    private String paramHash(CategoryConfig config, Map<UUID, String> attributeValues) {
        if (attributeValues == null || attributeValues.isEmpty()) {
            return null;
        }
        Map<String, String> canonical = new LinkedHashMap<>();
        for (CategoryConfig.AttributeView attribute : config.attributes()) {
            if (!attribute.identity() || !"active".equals(attribute.status())) {
                continue;
            }
            String value = attributeValues.get(attribute.id());
            if (!hasText(value)) {
                continue;
            }
            canonical.put(attribute.code(), canonicalValue(attribute, value));
        }
        if (canonical.isEmpty()) {
            return null;
        }
        return join(canonical);
    }

    /**
     * 规范化单个值。
     *
     * <p>数字走 {@link BigDecimal}：{@code 6.3} 和 {@code 6.30} 是同一个数，
     * 但作为字符串它们是两个值。枚举和文本只做 trim + 小写。
     */
    private String canonicalValue(CategoryConfig.AttributeView attribute, String raw) {
        String trimmed = raw.trim();
        if (ValueType.from(attribute.valueType()) == ValueType.NUMBER) {
            try {
                return new BigDecimal(trimmed).stripTrailingZeros().toPlainString() + "|" + unit(attribute);
            } catch (NumberFormatException e) {
                // 格式错在发布闸门就被拦住，这里防御性返回原值
                return trimmed.toLowerCase(java.util.Locale.ROOT);
            }
        }
        return trimmed.toLowerCase(java.util.Locale.ROOT);
    }

    /** 数字属性必须带单位（建模板时已强制），没有就空串——{@code 1} 和 {@code 1|m} 不该相等。 */
    private String unit(CategoryConfig.AttributeView attribute) {
        String unit = attribute.unit();
        return unit == null ? "" : unit.trim().toLowerCase(java.util.Locale.ROOT);
    }

    /** {@code code=值&code=值}，code 排序后拼，传参顺序不影响结果。 */
    private String join(Map<String, String> canonical) {
        List<String> keys = new ArrayList<>(canonical.keySet());
        keys.sort(null);
        StringBuilder sb = new StringBuilder();
        for (String key : keys) {
            if (!sb.isEmpty()) {
                sb.append('&');
            }
            sb.append(key).append('=').append(canonical.get(key));
        }
        return sb.toString();
    }

    private static Map<UUID, CategoryConfig.AttributeView> index(CategoryConfig config) {
        Map<UUID, CategoryConfig.AttributeView> byId = new LinkedHashMap<>();
        for (CategoryConfig.AttributeView attribute : config.attributes()) {
            byId.put(attribute.id(), attribute);
        }
        return byId;
    }

    private static String normalize(String raw) {
        return raw == null ? "" : raw.trim().toLowerCase(java.util.Locale.ROOT);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    /**
     * 一次识别的结果。
     *
     * @param kind 用哪种键认出来的。{@link IdentityKind#NONE} 表示认不出来
     * @param matchKey 算出来的键；认不出来时是 null
     */
    public record ResolvedIdentity(IdentityKind kind, String matchKey) {

        public static ResolvedIdentity none() {
            return new ResolvedIdentity(IdentityKind.NONE, null);
        }

        public boolean identified() {
            return kind.isKey() && matchKey != null;
        }
    }
}
