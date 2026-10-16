/**
 * Rum 模块 —— 前端遥测（RUM）的接收与处理：接住浏览器发来的错误 / 性能 / 接口 / PV / 文案兜底事件，
 * 校验、加工，再落到指标与日志。
 *
 * <p>它和 {@code infra.observability} 的 {@code BizEvent} 是**两个方向**的东西：BizEvent 是服务端
 * 自己对自己说「发生了什么」，值可信、基数受控；这里的数据**全部由客户端给**，接口匿名可达。
 * 所以本模块的每条加工规则都在回答同一个问题：**不信客户端的话，还能留下什么有用的东西**——
 * 进指标标签的值一律过 {@link com.shop.platform.rum.RumVocabulary} 的白名单，自由文本只进日志。
 *
 * <p>为什么独立成模块而不是留在 {@code infra/web}：{@code infra} 是共享纯包（技术适配，无业务语义），
 * 而这里要长出一条完整的链路——投递（消息队列）、加工（消费端的 {@code RumProcessor[]} 链：
 * 脱敏与路径归一）、落点（计数 / 日志 / {@code rum.rum_events} 明细）。
 * 一条会落表的链路按本仓规则必须独占 schema，见 {@code apps/server/AGENTS.md}「模块 = 顶层包 = schema」。
 *
 * <p>不对外提供任何 API：它是消费方，不是被依赖方。别的模块不该 import 这里的任何东西。
 */
@ApplicationModule(displayName = "Rum")
package com.shop.platform.rum;

import org.springframework.modulith.ApplicationModule;
