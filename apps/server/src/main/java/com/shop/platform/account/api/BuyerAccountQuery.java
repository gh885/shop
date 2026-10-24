package com.shop.platform.account.api;

import com.shop.platform.account.mapper.BuyerMapper;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** {@link AccountQuery} 的实现。只读，不开事务。 */
@Component
public class BuyerAccountQuery implements AccountQuery {

    private final BuyerMapper buyers;

    public BuyerAccountQuery(BuyerMapper buyers) {
        this.buyers = Objects.requireNonNull(buyers, "buyers");
    }

    @Override
    public Optional<BuyerState> find(UUID buyerId) {
        return buyers.find(buyerId).map(row -> new BuyerState(row.buyerId(), row.nickname(), row.active()));
    }
}
