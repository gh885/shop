package com.shop.platform.governance.mapper;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ForbiddenWordMapper {

    @Select(
            """
            <script>
            SELECT id, word, status, created_at AS createdAt
              FROM governance.forbidden_word
             WHERE 1 = 1
            <if test="status != null and status != ''">
               AND status = #{status}
            </if>
            <if test="keyword != null and keyword != ''">
               AND word ILIKE '%' || #{keyword} || '%'
            </if>
             ORDER BY word
             LIMIT 500
            </script>
            """)
    List<Row> list(@Param("status") String status, @Param("keyword") String keyword);

    /** 命中的词；长词优先，先报最具体的那个。 */
    @Select(
            """
            SELECT word
              FROM governance.forbidden_word
             WHERE status = 'active'
               AND position(lower(word) in lower(#{text})) > 0
             ORDER BY length(word) DESC
             LIMIT 1
            """)
    Optional<String> firstHit(@Param("text") String text);

    @Select("SELECT EXISTS (SELECT 1 FROM governance.forbidden_word WHERE lower(word) = lower(#{word}))")
    boolean exists(@Param("word") String word);

    @Insert(
            """
            INSERT INTO governance.forbidden_word (id, word, status, created_by)
            VALUES (#{id}, #{word}, 'active', #{createdBy})
            """)
    void insert(@Param("id") UUID id, @Param("word") String word, @Param("createdBy") UUID createdBy);

    @Update("UPDATE governance.forbidden_word SET status = #{status} WHERE id = #{id} AND status <> #{status}")
    int updateStatus(@Param("id") UUID id, @Param("status") String status);

    record Row(UUID id, String word, String status, Instant createdAt) {}
}
