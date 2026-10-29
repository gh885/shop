package com.shop.platform.catalog.controller;

import com.shop.platform.catalog.mapper.BrandMapper;
import com.shop.platform.catalog.service.BrandAdminService;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 平台品牌主数据。发布闸门只认 approved。 */
@RestController
@RequestMapping("/api/admin/brands")
public class AdminBrandController {

    private final BrandAdminService brands;
    private final Authorizer authorizer;

    public AdminBrandController(BrandAdminService brands, Authorizer authorizer) {
        this.brands = brands;
        this.authorizer = authorizer;
    }

    @GetMapping
    public List<BrandMapper.BrandRow> list(@RequestParam(required = false) String keyword) {
        authorizer.check(Permission.CATEGORY_MANAGE);
        return brands.list(keyword);
    }

    @PostMapping
    public CreatedBrand create(@Valid @RequestBody CreateBrandRequest request) {
        authorizer.check(Permission.CATEGORY_MANAGE);
        return new CreatedBrand(brands.create(
                request.name(), request.logoUrl(), authorizer.current().operatorId()));
    }

    @PutMapping("/{brandId}/status")
    public void updateStatus(@PathVariable UUID brandId, @Valid @RequestBody UpdateBrandStatusRequest request) {
        authorizer.check(Permission.CATEGORY_MANAGE);
        brands.updateStatus(brandId, request.status(), authorizer.current().operatorId());
    }

    public record CreateBrandRequest(@NotBlank @Size(max = 128) String name, @Size(max = 1024) String logoUrl) {}

    public record UpdateBrandStatusRequest(@NotBlank String status) {}

    public record CreatedBrand(UUID id) {}
}
