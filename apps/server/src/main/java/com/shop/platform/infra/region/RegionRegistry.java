package com.shop.platform.infra.region;

import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 国标行政区划码注册表（共享纯包 infra 下的通用能力，buyer/seller 两端共用）：
 * 启动时加载 regions/regions.json，扁平化为合法 6 位区划码集合，用于校验 address.regionCode；
 * 并提供「省/市/区名称 → 国标码」解析，供智能粘贴把第三方解析出的区划名称映射回本平台权威码。
 *
 * <p>数据只有一份，在 {@code packages/common/src/data/regions.json}（前端 loadRegionTree 的静态依赖）；
 * 由 pom 的 &lt;resources&gt; 按 {@code regions/} 复制进 classpath，别在这里放第二份。
 *
 * <p>数据结构：省(2位) → 市(4位) → 区县(6位)。直筒子市（东莞/中山/儋州/嘉峪关等）没有 6 位区级
 * children（其 children 是 9 位街道码），按惯例把该市本身作为区级，码为 cityCode+"00"（如东莞 441900）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RegionRegistry {

    private final ObjectMapper objectMapper;

    /** 合法 6 位国标行政区划码集合 */
    private final Set<String> validCodes = new HashSet<>();

    /** 省/市/区名称（归一化）→ 国标码 的叶子记录，供智能粘贴名称反查 */
    private final List<RegionLeaf> leaves = new ArrayList<>();

    /** 归一化后的区划叶子：province/city/county 为去掉行政后缀的名称，code 为 6 位国标码 */
    private record RegionLeaf(String province, String city, String county, String code) {}

    @PostConstruct
    public void load() {
        try (InputStream in = new ClassPathResource("regions/regions.json").getInputStream()) {
            JsonNode root = objectMapper.readTree(in);
            for (JsonNode province : root) {
                walk(province, new String[2], 0);
            }
            log.info("[REGION] 行政区划码加载完成, 共 {} 个, 名称索引 {} 条", validCodes.size(), leaves.size());
        } catch (Exception e) {
            throw new IllegalStateException("加载行政区划数据失败", e);
        }
    }

    /** 递归遍历，记录合法 6 位码 + 名称叶子（depth: 0=省 1=市 2=区县） */
    private void walk(JsonNode node, String[] path, int depth) {
        String code = node.path("code").asString();
        String name = node.path("name").asString();

        if (code.length() == 6) {
            validCodes.add(code);
        }
        if (depth == 2 && code.length() == 6) {
            leaves.add(new RegionLeaf(normalize(path[0]), normalize(path[1]), normalize(name), code));
        }

        JsonNode children = node.get("children");
        if (children == null || !children.isArray() || children.isEmpty()) {
            return;
        }
        String first = children.get(0).path("code").asString();
        // 直筒子市：children 是 9 位街道码 → 该市本身作为区级，码为 cityCode+"00"
        if (depth == 1 && first.length() == 9) {
            validCodes.add(code + "00");
            leaves.add(new RegionLeaf(normalize(path[0]), normalize(name), normalize(name), code + "00"));
        }
        String[] childPath = path.clone();
        if (depth < 2) {
            childPath[depth] = name;
        }
        for (JsonNode child : children) {
            walk(child, childPath, depth + 1);
        }
    }

    /** regionCode 是否为合法国标 6 位区划码 */
    public boolean isValidCode(String regionCode) {
        return regionCode != null && validCodes.contains(regionCode);
    }

    /**
     * 前缀是否落在国标区划码空间里（2 位省 / 4 位市 / 6 位区县）。
     *
     * <p>运费模板的区域规则存<b>前缀</b>而不是枚举成员表：{@code 44} 即广东全省、{@code 4403} 即深圳市。
     * 判据是「至少有一个区划码以它开头」，所以不会出现指向不存在省市的悬空前缀。
     */
    public boolean hasRegionPrefix(String prefix) {
        if (prefix == null || prefix.isEmpty() || prefix.length() % 2 != 0 || prefix.length() > 6) {
            return false;
        }
        for (int i = 0; i < prefix.length(); i++) {
            if (!Character.isDigit(prefix.charAt(i))) {
                return false;
            }
        }
        return validCodes.stream().anyMatch(code -> code.startsWith(prefix));
    }

    /**
     * 按省/市/区名称解析出国标 6 位区划码（智能粘贴用）。
     * 名称匹配做了后缀归一化（去 省/市/区/县 等），并容忍直辖市 city 与省同名（如北京 city=北京市）。
     * 找不到返回 null，交由调用方降级处理。
     */
    public String resolveCode(String province, String city, String county) {
        String p = normalize(province);
        String c = normalize(city);
        String d = normalize(county);
        if (p.isEmpty() || d.isEmpty()) {
            return null;
        }
        for (RegionLeaf leaf : leaves) {
            if (!leaf.province().equals(p) || !leaf.county().equals(d)) {
                continue;
            }
            // 直辖市：city 与 province 同名时视为唯一市，跳过 city 精确匹配
            boolean cityOk = leaf.city().equals(c) || leaf.city().equals(p) || c.equals(p);
            if (cityOk) {
                return leaf.code();
            }
        }
        return null;
    }

    /** 去行政后缀归一化：浙江省→浙江、杭州市→杭州、西湖区→西湖、市辖区→市辖 */
    private static String normalize(String name) {
        if (name == null) {
            return "";
        }
        String s = name.trim();
        String[] suffixes = {"特别行政区", "自治区", "自治州", "地区", "盟", "省", "市", "区", "县"};
        for (String suffix : suffixes) {
            if (s.endsWith(suffix)) {
                s = s.substring(0, s.length() - suffix.length());
                break;
            }
        }
        return s;
    }
}
