import { notify } from "@shop/app-kit"

/**
 * 搜索后端未建：首页大搜索框与内页顶栏搜索框共用同一句占位反馈。
 * 文案只此一处——两个搜索框各写一句必然漂移（同一个状态在两个地方叫两个名字）。
 */
export function notifySearchComingSoon(keyword: string) {
    if (!keyword.trim()) {
        notify.info("请输入搜索关键词")
        return
    }
    notify.info("搜索功能即将上线")
}
