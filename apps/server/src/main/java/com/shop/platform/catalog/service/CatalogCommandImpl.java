package com.shop.platform.catalog.service;

import com.shop.platform.catalog.api.CatalogCommand;
import com.shop.platform.catalog.mapper.SpuMapper;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class CatalogCommandImpl implements CatalogCommand {

    private final SpuMapper spus;

    public CatalogCommandImpl(SpuMapper spus) {
        this.spus = Objects.requireNonNull(spus, "spus");
    }

    @Override
    public void addSold(Map<UUID, Integer> quantityBySpu) {
        quantityBySpu.forEach((spuId, quantity) -> {
            if (quantity != null && quantity > 0) {
                spus.addSold(spuId, quantity);
            }
        });
    }

    @Override
    public void decSold(Map<UUID, Integer> quantityBySpu) {
        quantityBySpu.forEach((spuId, quantity) -> {
            if (quantity != null && quantity > 0) {
                spus.decSold(spuId, quantity);
            }
        });
    }
}
