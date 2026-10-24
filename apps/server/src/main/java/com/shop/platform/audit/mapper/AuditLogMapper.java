package com.shop.platform.audit.mapper;

import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 审计表的 SQL 只在这里。按 module-map 第 8.4 节，模块内部的数据访问住 {@code mapper/}——
 * 也只有这个包允许出现原生 SQL（见 {@code ArchitectureTest}）。
 */
@Mapper
public interface AuditLogMapper {

    @Select("SELECT action FROM audit.audit_action")
    List<String> knownActions();

    @Insert(
            """
            INSERT INTO audit.audit_log
                (action, object_type, object_id, operator_type, operator_id, merchant_id, changes, result, trace_id)
            VALUES (#{action}, #{objectType}, #{objectId}, #{operatorType}, #{operatorId}, #{merchantId},
                    CAST(#{changes} AS jsonb), #{result}, #{traceId})
            """)
    void append(
            @Param("action") String action,
            @Param("objectType") String objectType,
            @Param("objectId") String objectId,
            @Param("operatorType") String operatorType,
            @Param("operatorId") UUID operatorId,
            @Param("merchantId") UUID merchantId,
            @Param("changes") String changesJson,
            @Param("result") String result,
            @Param("traceId") String traceId);
}
