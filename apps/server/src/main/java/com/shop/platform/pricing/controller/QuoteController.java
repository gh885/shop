package com.shop.platform.pricing.controller;

import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.pricing.api.PricingRequest;
import com.shop.platform.pricing.dto.QuoteRequest;
import com.shop.platform.pricing.service.PriceQuoteService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家侧算价入口：结算页试算。
 *
 * <p>返回 {@code quoteId}，下单必须带着它——金额从报价单读，不从请求体读。
 * 前端不能"算完价自己再传一次总价"，那样算价就只是个装饰。
 *
 * <p>不判权限点：买家没有那套体系，{@code authorizer.current()} 只用来拿 {@code buyerId}
 * （报价单要记是谁算的，落单时还要拿它比对指纹）。
 */
@RestController
@RequestMapping("/api/quotes")
public class QuoteController {

    private final PriceQuoteService quotes;
    private final Authorizer authorizer;

    public QuoteController(PriceQuoteService quotes, Authorizer authorizer) {
        this.quotes = quotes;
        this.authorizer = authorizer;
    }

    @PostMapping
    public PricingRequest.Quoted quote(@Valid @RequestBody QuoteRequest request) {
        UUID buyerId = authorizer.current().operatorId();

        List<PricingRequest.Line> lines = request.lines().stream()
                .map(line ->
                        new PricingRequest.Line(line.lineNo(), line.offerId(), line.skuId(), null, line.quantity()))
                .toList();

        PricingRequest.Address address = request.address() == null
                ? null
                : new PricingRequest.Address(
                        request.address().provinceCode(),
                        request.address().cityCode(),
                        request.address().districtCode());

        // 资格快照这一版空着：券和会员等级还没有，占位不如留空
        return quotes.quote(new PricingRequest(buyerId, address, lines, List.of()));
    }
}
