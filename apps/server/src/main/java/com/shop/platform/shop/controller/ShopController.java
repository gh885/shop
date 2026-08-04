package com.shop.platform.shop.controller;

import com.shop.platform.common.UserIdHolder;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.service.ShopService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/shops")
@RequiredArgsConstructor
public class ShopController {

    private final ShopService shopService;

    /** 开店：当前登录用户（统一账号）创建店铺，落 PENDING_REVIEW 待平台审核 */
    @PostMapping
    public Shop create(@Valid @RequestBody CreateShopRequest req) {
        UUID ownerId = UserIdHolder.get();
        return shopService.createShop(ownerId, req.name(), req.logoKey());
    }

    public record CreateShopRequest(@NotBlank @Size(max = 50) String name, @Size(max = 255) String logoKey) {
        public CreateShopRequest {
            if (name != null) name = name.trim();
        }
    }
}
