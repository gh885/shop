package com.shop.platform.fulfillment.api;

import com.shop.platform.common.BusinessException;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 承运商白名单与码形态。发货入口的第一道校验：填错码当场 400，而不是让运单挂在一个
 * 永远查不到轨迹的承运商上，等买家投诉"查不到物流"才发现。
 *
 * <p>放在 api 包：{@link #normalize} 是<b>双方共用的口径</b>——fulfillment 落
 * {@code package.carrier_code}，logistics 落 {@code trace_event.carrier_code} 并查
 * {@code carrier_code_map}。两边各写一遍小写转换，迟早有一边漏掉。
 *
 * <p>先钉在代码里而不是建表：现在只有九家，建表会让人以为已经有维护入口。
 * 接真渠道时码表和轨迹服务的承运商编码对齐，那时再变成数据。
 *
 * <p><b>存进去的一律是归一化后的小写。</b>推送方发的哪一档大小写不受我们控制，
 * 而定位包裹是 {@code carrier_code = ?} 的精确匹配——商家录 {@code SF}、渠道推 {@code sf}，
 * 运单就永远查不到。所以 {@link #normalize} 是<b>唯一</b>的码形态出口：写入前必须过它，
 * 按承运商查的参数也必须过它，中间不留"原样保留"的分支。
 *
 * <p>归一化是幂等的，所以在每个边界上都调一次也不会有第二种结果。
 */
public final class Carriers {

    private static final Map<String, String> CATALOG = Map.ofEntries(
            Map.entry("sf", "顺丰速运"),
            Map.entry("ems", "中国邮政EMS"),
            Map.entry("zto", "中通快递"),
            Map.entry("yto", "圆通速递"),
            Map.entry("sto", "申通快递"),
            Map.entry("yunda", "韵达快递"),
            Map.entry("jt", "极兔速递"),
            Map.entry("jd", "京东物流"),
            Map.entry("deppon", "德邦快递"));

    private Carriers() {}

    /** 不认识就 400，提示里带上全部可选码——商家不需要翻文档找码表。 */
    public static void requireKnown(String carrierCode) {
        if (carrierCode == null || !CATALOG.containsKey(normalize(carrierCode))) {
            throw BusinessException.badRequest("未知承运商: " + carrierCode + "，可选："
                    + CATALOG.entrySet().stream()
                            .map(entry -> entry.getKey() + "(" + entry.getValue() + ")")
                            .collect(Collectors.joining("、")));
        }
    }

    /**
     * 归一化：去空白 + 转小写。**所有落库值和按承运商查的参数都必须过这里。**
     *
     * <p>不做"录什么就存什么"——那会让 {@code SF / sf / Sf} 成为三个不同的承运商，
     * 连 {@code uq_package_tracking (carrier_code, tracking_no)} 都挡不住同一运单录两遍。
     *
     * @return null 进 null 出；调用方要么已经校验过非空，要么自己接住 null
     */
    public static String normalize(String code) {
        return code == null ? null : code.trim().toLowerCase(Locale.ROOT);
    }
}
