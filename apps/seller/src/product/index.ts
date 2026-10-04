/**
 * products —— 卖家商品域文件夹（扁形态）：
 * - edit-rules.ts   ：商品状态 × 编辑会话能力规则表（后端状态机的声明式镜像）
 * - draft-model.ts ：发布草稿的领域模型（类型 + 纯规则 + 投影，不碰 React/网络）
 * - queries.ts     ：TanStack Query 定义层（key 工厂 + queryOptions + SDK 调用封装 + 类目树 hooks）
 * - Category*.tsx   ：发布第一步「选类目」的组件（页签 / 搜索 / 级联三列）
 * - ProductEditor ：发布第二步完整编辑会话（回填 / 未保存保护 / 保存），表单与草稿 hook 留在域内
 *
 * 桶文件只暴露外部真正消费的那几个；域内一律相对路径直连，不走这里。
 */

export { CategoryStep } from "./create/category/CategoryStep"
export { ProductEditor } from "./create/basic/ProductEditor"
