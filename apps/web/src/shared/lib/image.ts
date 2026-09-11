import { createImgUrl } from "@shop/app-kit"

/** 图片 CDN 域名来自构建期变量（见 packages/app-kit 的 createImgUrl） */
export const imgUrl = createImgUrl(import.meta.env.VITE_IMAGE_BASE_URL)
