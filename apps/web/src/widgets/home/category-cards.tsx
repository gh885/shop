import { Skeleton } from "@shop/ui-web"

import { HomeCategoryNav } from "#/features/home/home-category-nav"
import { UserCard } from "#/features/home/user-card"
import { useBanners, useHomeNav } from "#/features/home/use-home"

/** 首页第二层：左侧分类导航 + 中间三个运营位 + 最右用户卡片 */
export function CategoryCards() {
    const nav = useHomeNav()
    const banners = useBanners()

    return (
        <section className="mx-auto max-w-(--container-page) px-6 py-6">
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_250px] gap-4">
                <HomeCategoryNav
                    defaultHeight={200}
                    entries={nav.data}
                />
                {banners.data
                    ? banners.data.slice(0, 3).map((banner) => (
                          <button
                              key={banner.id}
                              type="button"
                              className="group relative h-[200px] overflow-hidden rounded-xl text-left"
                          >
                              <img
                                  src={banner.image}
                                  alt={banner.title}
                                  loading="lazy"
                                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                              <div className="absolute inset-x-0 bottom-0 p-4">
                                  <div className="text-base font-bold text-white">
                                      {banner.title}
                                  </div>
                                  {banner.subtitle && (
                                      <div className="mt-0.5 text-xs text-white/80">
                                          {banner.subtitle}
                                      </div>
                                  )}
                              </div>
                          </button>
                      ))
                    : Array.from({ length: 3 }, (_, i) => (
                          <Skeleton
                              key={i}
                              className="h-[200px] rounded-xl"
                          />
                      ))}
                <UserCard />
            </div>
        </section>
    )
}
