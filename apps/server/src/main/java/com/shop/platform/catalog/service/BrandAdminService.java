package com.shop.platform.catalog.service;

import com.shop.platform.audit.api.AuditCommand;
import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.catalog.mapper.BrandMapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 品牌主数据。发布闸门只认 {@code approved}，所以品牌必须有平台侧入口维护状态；
 * 否则商家一填品牌就 400，而没有任何地方能把它改成 approved。
 */
@Component
public class BrandAdminService {

    private final BrandMapper brands;
    private final AuditCommand audit;

    public BrandAdminService(BrandMapper brands, AuditCommand audit) {
        this.brands = Objects.requireNonNull(brands, "brands");
        this.audit = Objects.requireNonNull(audit, "audit");
    }

    public List<BrandMapper.BrandRow> list(String keyword) {
        return brands.list(keyword == null || keyword.isBlank() ? null : keyword.trim());
    }

    @Transactional
    public UUID create(String name, String logoUrl, UUID operatorId) {
        if (name == null || name.isBlank()) {
            throw BusinessException.badRequest("品牌名称不能为空");
        }
        if (brands.existsName(name.trim())) {
            throw BusinessException.conflict("品牌已存在: " + name.trim());
        }
        UUID id = Ids.newId();
        brands.insert(id, name.trim(), logoUrl, "approved");
        audit.record(AuditEntry.byStaff(
                "catalog.brand.created",
                "brand",
                id.toString(),
                operatorId,
                null,
                Map.of("name", FieldChange.to(name.trim()))));
        return id;
    }

    @Transactional
    public void updateStatus(UUID brandId, String status, UUID operatorId) {
        if (!"approved".equals(status) && !"rejected".equals(status)) {
            throw BusinessException.badRequest("品牌状态只能是 approved / rejected: " + status);
        }
        if (brands.updateStatus(brandId, status) == 0) {
            throw BusinessException.notFound("品牌不存在或状态未变化: " + brandId);
        }
        audit.record(AuditEntry.byStaff(
                "catalog.brand.status_changed",
                "brand",
                brandId.toString(),
                operatorId,
                null,
                Map.of("status", FieldChange.to(status))));
    }
}
