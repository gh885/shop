package com.shop.platform.fulfillment.model;

import com.shop.platform.common.BusinessException;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 承运商白名单。发货入口的第一道校验：填错码当场 400，而不是让运单挂在一个
 * 永远查不到轨迹的承运商上，等买家投诉"查不到物流"才发现。
 *
 * <p>先钉在代码里而不是建表：现在只有九家，建表会让人以为已经有维护入口。
 * logistics 落地轨迹对接时，码表要和轨迹服务的承运商编码对齐，那时再变成数据。
 *
 * <p>比对大小写不敏感：商家录 {@code SF} 和 {@code sf} 是一家，存进去的仍是商家录入的原样。
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

    private static String normalize(String code) {
        return code.trim().toLowerCase(Locale.ROOT);
    }
}
