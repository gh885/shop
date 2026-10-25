package com.shop.platform.clearing.mapper;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 账务的 SQL 只在这里。放在 {@code mapper} 包里是被 ArchUnit 规则逼的，也是对的：
 * 能用原生 SQL 的地方必须是少数、显式、可评审的几个包，否则数据权限和审计随时能被绕过。
 *
 * <p>这个接口只搬数据，不做判断。金额配不配平、幂等怎么处理，都在 {@code Ledger} 里。
 */
@Mapper
public interface LedgerMapper {

    @Insert(
            """
            INSERT INTO clearing.posting_group (biz_type, biz_no, currency)
            VALUES (#{bizType}, #{bizNo}, #{currency})
            ON CONFLICT (biz_no) DO NOTHING
            """)
    int insertGroupIgnoreConflict(
            @Param("bizType") String bizType, @Param("bizNo") String bizNo, @Param("currency") String currency);

    @Select("SELECT id FROM clearing.posting_group WHERE biz_no = #{bizNo}")
    Optional<UUID> findGroup(@Param("bizNo") String bizNo);

    /** 空表示这个 {@code bizNo} 已经记过账。 */
    default Optional<UUID> createGroup(String bizType, String bizNo, String currency) {
        if (insertGroupIgnoreConflict(bizType, bizNo, currency) == 1) {
            return Optional.of(findGroup(bizNo).orElseThrow());
        }
        return Optional.empty();
    }

    /** 返回 false 表示账户不存在或币种不符。 */
    @Update(
            "UPDATE clearing.ledger_account SET balance = balance + #{delta} WHERE id = #{accountId} AND currency = #{currency}")
    boolean addToBalance(
            @Param("accountId") UUID accountId, @Param("delta") long delta, @Param("currency") String currency);

    /** 一组分录一次批量写入。余额更新仍逐条做（条件更新要看影响行数），分录本身没有条件。 */
    @Insert(
            """
            <script>
            INSERT INTO clearing.ledger_entry (group_id, account_id, amount, effective_date)
            VALUES
            <foreach collection="entries" item="e" separator=",">
                (#{groupId}, #{e.accountId}, #{e.amount}, CURRENT_DATE)
            </foreach>
            </script>
            """)
    void appendEntries(@Param("groupId") UUID groupId, @Param("entries") List<Entry> entries);

    /** @param accountId 分录落到哪个账户；{@code amount} 可正可负，借贷方向靠符号 */
    record Entry(UUID accountId, long amount) {}
}
