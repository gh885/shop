package com.shop.platform.user.service;

import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.util.HashSet;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 国标行政区划码注册表：启动时加载 regions/regions.json（与前端 shared/data/regions.json 同源），
 * 扁平化为合法 6 位区划码集合，用于校验 address.regionCode。
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

    @PostConstruct
    void load() {
        try (InputStream in = new ClassPathResource("regions/regions.json").getInputStream()) {
            JsonNode root = objectMapper.readTree(in);
            for (JsonNode province : root) {
                walk(province);
            }
            log.info("[USER] 行政区划码加载完成, 共 {} 个", validCodes.size());
        } catch (Exception e) {
            throw new IllegalStateException("加载行政区划数据失败", e);
        }
    }

    private void walk(JsonNode node) {
        String code = node.path("code").asText();
        if (code.length() == 6) {
            validCodes.add(code);
        }

        JsonNode children = node.get("children");
        if (children != null && children.isArray() && !children.isEmpty()) {
            // 直筒子市：children 是 9 位街道码 → 该市本身作为区级，码为 cityCode+"00"
            String first = children.get(0).path("code").asText();
            if (first.length() == 9) {
                validCodes.add(code + "00");
            }
            for (JsonNode child : children) {
                walk(child);
            }
        }
    }

    /** regionCode 是否为合法国标 6 位区划码 */
    public boolean isValidCode(String regionCode) {
        return regionCode != null && validCodes.contains(regionCode);
    }
}
