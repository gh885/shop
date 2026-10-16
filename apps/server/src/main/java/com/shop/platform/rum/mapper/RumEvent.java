package com.shop.platform.rum.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.BaseEntity;
import java.time.OffsetDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 一条前端事件的明细行。
 *
 * <p>append-only：继承 {@link BaseEntity}（不记 updated_at），本模块没有 UPDATE 入口。
 * 事件一旦收了就不会变——「改一条历史遥测」既没有语义，也会让「当时到底发生了什么」失去意义。
 *
 * <p>列是**从 payload 里提出来的副本**，不是全部。提出来的那几个（app / kind / fingerprint /
 * route / session_id / user_id / name / 时间）是会被查询命中的；其余整段留在 {@code payload}。
 * 这条分界由迁移 {@code V76__rum_events.sql} 的头部注释解释。
 *
 * <p>{@code payload} 用 String 而不是 JsonNode 接：本仓库同时挂着 Jackson 2（MyBatis-Plus 的
 * {@code JacksonTypeHandler} 用它）与 Jackson 3（{@code tools.jackson}，应用层用），而事件是
 * Jackson 3 的节点。让 MP 的 handler 去序列化一个 Jackson 3 的 {@code JsonNode} 会得到垃圾——
 * 与其在两个 Jackson 之间搭桥，不如**原样存那一串 JSON 文本**：它本来就是个不透明文档，
 * 我们只写不读结构。写侧靠 Hikari 的 {@code stringtype=unspecified} 让 PG 按目标 jsonb 列推断。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("rum.rum_events")
public class RumEvent extends BaseEntity {

    /** 客户端事件时刻（信封 ts）。**不可信**：设备时钟会不准，也会被人为造假 */
    private OffsetDateTime ts;

    /** web / seller / admin。取自消息键，接收端已过白名单 */
    private String app;

    /** error / performance / api / route / fallback */
    private String kind;

    /** 构建标识。它是「这次故障是哪次发布引入的」唯一的答案来源 */
    private String version;

    /** dev / prod */
    private String env;

    /** 路由模板（服务端已砍 query 与 hash、纯数字段折成 $id） */
    private String route;

    /** 会话：算「影响多少个会话」的分母 */
    private String sessionId;

    /** 已登录用户 id；未登录为空。它是明细字段，不做指标标签 */
    private String userId;

    /** 受控名：error 的事件名 / fallback 的 source / performance 的指标名 */
    private String name;

    /** 错误指纹：把「同一个问题」聚成一组的键。只有 error 有 */
    private String fingerprint;

    /** 自由文本摘要。**落库前已在消费端脱敏** */
    private String message;

    /** 整条事件的 JSON 副本（脱敏后），含 device 与面包屑 */
    private String payload;
}
