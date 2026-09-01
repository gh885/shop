/** 卖家中心地址：独立 SPA（apps/seller），开发期固定 5000 端口；生产用 VITE_SELLER_URL 覆盖 */
export const SELLER_URL = import.meta.env.VITE_SELLER_URL || "http://localhost:5000"
