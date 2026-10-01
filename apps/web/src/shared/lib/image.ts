import { createImgUrl } from "@shop/app-kit/display" /** 图片 CDN 域名来自构建期变量 */
export const imgUrl = createImgUrl(import.meta.env.VITE_IMAGE_BASE_URL)
