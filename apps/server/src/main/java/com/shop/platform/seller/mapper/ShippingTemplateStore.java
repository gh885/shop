package com.shop.platform.seller.mapper;

import com.shop.platform.infra.db.JsonColumns;
import com.shop.platform.seller.api.FreightRule;
import com.shop.platform.seller.api.ShippingTemplateQuery;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;

/**
 * {@link ShippingTemplateQuery} 的读侧实现：算价取模板只走这个 bean，
 * SQL 与读写都在 {@link ShippingTemplateMapper}，这里只做 jsonb 到值对象的收尾。
 */
@Component
public class ShippingTemplateStore implements ShippingTemplateQuery {

    private final ShippingTemplateMapper templates;

    public ShippingTemplateStore(ShippingTemplateMapper templates) {
        this.templates = Objects.requireNonNull(templates, "templates");
    }

    // —— 读 ——

    @Override
    public Optional<FreightRule> activeFor(UUID shopId) {
        return templates
                .findActive(shopId)
                .map(row -> new FreightRule(row.id(), row.chargeBy(), row.freeOver(), parseRegions(row.regions())));
    }

    private List<FreightRule.Region> parseRegions(String raw) {
        List<FreightRule.Region> parsed = JsonColumns.read(raw, new TypeReference<ArrayList<FreightRule.Region>>() {});
        return parsed == null ? List.of() : List.copyOf(parsed);
    }
}
