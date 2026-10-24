package com.shop.platform.infra.db;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.postgresql.util.PGobject;

/**
 * String ↔ PG {@code jsonb} 列。实体的 jsonb 字段声明为 String（JSON 原文），
 * 写方向裹成 {@link PGobject} 以 jsonb 类型下发，不靠 {@code stringtype=unspecified}
 * 放宽整条连接的参数推断；读方向直接拿原文，解析成什么形状由调用方用 {@link JsonColumns} 决定。
 *
 * <p>用法：字段上 {@code @TableField(typeHandler = PgJsonbTypeHandler.class)}，
 * 类上 {@code @TableName(autoResultMap = true)}；注解 SQL 里则维持 {@code CAST(#{x} AS jsonb)} 原样。
 */
public class PgJsonbTypeHandler extends BaseTypeHandler<String> {

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, String parameter, JdbcType jdbcType)
            throws SQLException {
        PGobject jsonb = new PGobject();
        jsonb.setType("jsonb");
        jsonb.setValue(parameter);
        ps.setObject(i, jsonb);
    }

    @Override
    public String getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return rs.getString(columnName);
    }

    @Override
    public String getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return rs.getString(columnIndex);
    }

    @Override
    public String getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return cs.getString(columnIndex);
    }
}
