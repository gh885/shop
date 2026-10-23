package com.shop.platform.account.mapper;

import com.shop.platform.infra.db.RowMappers;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** 买家收货地址的读写。 */
@Component
public class AddressStore {

    private static final String COLS =
            """
            id, buyer_id, receiver_name, phone, region_code, province, city, district, detail, label,
            is_default, created_at, updated_at
            """;

    private static final String FIND =
            """
            SELECT %s FROM account.addresses WHERE id = :id
            """.formatted(COLS);

    private static final String FIND_BY_BUYER =
            """
            SELECT %s FROM account.addresses WHERE buyer_id = :buyerId
            ORDER BY is_default DESC, created_at DESC
            """
                    .formatted(COLS);

    private static final String COUNT_BY_BUYER = "SELECT count(*) FROM account.addresses WHERE buyer_id = :buyerId";

    private static final String INSERT =
            """
            INSERT INTO account.addresses
                (id, buyer_id, receiver_name, phone, region_code, province, city, district, detail,
                 label, is_default)
            VALUES
                (:id, :buyerId, :receiverName, :phone, :regionCode, :province, :city, :district, :detail,
                 :label, :isDefault)
            """;

    /** 只改内容字段，is_default 一律走 {@link #CLEAR_DEFAULT} + {@link #SET_DEFAULT}——「先清后设」两步，
     *  第一步先降级旧默认，第二步置真才不会撞 uk_addresses_default 的瞬时窗口 */
    private static final String UPDATE =
            """
            UPDATE account.addresses
               SET receiver_name = :receiverName, phone = :phone, region_code = :regionCode,
                   province = :province, city = :city, district = :district, detail = :detail,
                   label = :label, updated_at = now()
             WHERE id = :id
            """;

    private static final String DELETE = "DELETE FROM account.addresses WHERE id = :id";

    private static final String CLEAR_DEFAULT =
            """
            UPDATE account.addresses SET is_default = false, updated_at = now()
             WHERE buyer_id = :buyerId AND is_default
            """;

    private static final String SET_DEFAULT =
            """
            UPDATE account.addresses SET is_default = :isDefault, updated_at = now()
             WHERE id = :id AND buyer_id = :buyerId
            """;

    private static final RowMapper<AddressRow> ROW = RowMappers.of(AddressRow.class);

    private final JdbcClient jdbc;

    public AddressStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public Optional<AddressRow> find(UUID id) {
        return jdbc.sql(FIND).param("id", id).query(ROW).optional();
    }

    /** 默认置顶，其余创建时间倒序——结算页取列表第一条兜底就是「最新可用地址」 */
    public List<AddressRow> findByBuyer(UUID buyerId) {
        return jdbc.sql(FIND_BY_BUYER).param("buyerId", buyerId).query(ROW).list();
    }

    public long countByBuyer(UUID buyerId) {
        Long count = jdbc.sql(COUNT_BY_BUYER)
                .param("buyerId", buyerId)
                .query(Long.class)
                .single();
        return count == null ? 0 : count;
    }

    public void insert(AddressRow row) {
        jdbc.sql(INSERT)
                .param("id", row.id())
                .param("buyerId", row.buyerId())
                .param("receiverName", row.receiverName())
                .param("phone", row.phone())
                .param("regionCode", row.regionCode())
                .param("province", row.province())
                .param("city", row.city())
                .param("district", row.district())
                .param("detail", row.detail())
                .param("label", row.label())
                .param("isDefault", row.isDefault())
                .update();
    }

    public void updateContent(
            UUID id,
            String receiverName,
            String phone,
            String regionCode,
            String province,
            String city,
            String district,
            String detail,
            String label) {
        jdbc.sql(UPDATE)
                .param("id", id)
                .param("receiverName", receiverName)
                .param("phone", phone)
                .param("regionCode", regionCode)
                .param("province", province)
                .param("city", city)
                .param("district", district)
                .param("detail", detail)
                .param("label", label)
                .update();
    }

    public void delete(UUID id) {
        jdbc.sql(DELETE).param("id", id).update();
    }

    /** 第一步：把本人现有默认全部降级。目标行本身是默认也会先被降级，随后的置真就不会撞瞬时唯一窗口 */
    public void clearDefault(UUID buyerId) {
        jdbc.sql(CLEAR_DEFAULT).param("buyerId", buyerId).update();
    }

    /** 第二步：置/取消目标行的默认位。带 buyer 条件是纵深防御——调用方已校验过归属 */
    public void setDefault(UUID id, UUID buyerId, boolean isDefault) {
        jdbc.sql(SET_DEFAULT)
                .param("id", id)
                .param("buyerId", buyerId)
                .param("isDefault", isDefault)
                .update();
    }

    public record AddressRow(
            UUID id,
            UUID buyerId,
            String receiverName,
            String phone,
            String regionCode,
            String province,
            String city,
            String district,
            String detail,
            String label,
            boolean isDefault,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {}
}
