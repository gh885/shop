import { Link, createFileRoute } from "@tanstack/react-router"
import { Apple, ArrowRight, Baby, Shirt, Smartphone, Sofa, Sparkles, Store } from "lucide-react"
import { m, useReducedMotion } from "motion/react"

import { buttonVariants, Card, CardContent } from "@shop/ui-web"

import {
    HeroBody,
    HeroHeadline,
    LandingHero,
    LandingMotion,
    Reveal,
    SectionTitle,
    STAGGER,
} from "#/shared/ui/landing"

export const Route = createFileRoute("/welcome")({
    component: Home,
    head: () => ({
        meta: [{ title: "Shop - 多店铺电商平台" }],
    }),
})

function Home() {
    return (
        <LandingMotion>
            <div>
                <Hero />
                <Categories />
                <SellerBanner />
            </div>
        </LandingMotion>
    )
}

function Hero() {
    return (
        <LandingHero
            headline={
                <HeroHeadline>
                    千万小店，
                    <br />
                    各有各的好
                </HeroHeadline>
            }
            body={
                <HeroBody>
                    从产地直供到手作原创，每家店都有自己的脾气。逛的是店，买的是放心。
                </HeroBody>
            }
            actions={
                <div className="flex items-center gap-4">
                    <a
                        href="#categories"
                        className={buttonVariants({ size: "lg" })}
                    >
                        逛商品分类
                        <ArrowRight className="size-4" />
                    </a>
                    <Link
                        to="/sell"
                        className={buttonVariants({ variant: "outline", size: "lg" })}
                    >
                        我要开店
                    </Link>
                </div>
            }
            images={[
                {
                    src: "https://picsum.photos/seed/home-market/640/800",
                    alt: "集市上的特色小店",
                },
                { src: "https://picsum.photos/seed/home-crafts/640/480", alt: "手作商品摊位" },
                { src: "https://picsum.photos/seed/home-fresh/640/480", alt: "新鲜食材" },
            ]}
        />
    )
}

const CATEGORIES = [
    {
        name: "服饰鞋包",
        icon: Shirt,
        subs: ["女装", "男装", "鞋靴", "箱包"],
    },
    {
        name: "数码家电",
        icon: Smartphone,
        subs: ["手机", "电脑办公", "家用电器"],
    },
    {
        name: "美妆个护",
        icon: Sparkles,
        subs: ["护肤", "彩妆", "个人护理"],
    },
    {
        name: "家居家装",
        icon: Sofa,
        subs: ["家具", "家纺", "厨具"],
    },
    {
        name: "食品生鲜",
        icon: Apple,
        subs: ["休闲零食", "生鲜果蔬", "酒水饮料"],
    },
    {
        name: "母婴玩具",
        icon: Baby,
        subs: ["奶粉辅食", "纸尿裤", "玩具"],
    },
] as const

function Categories() {
    const reduce = useReducedMotion()

    return (
        <section
            id="categories"
            className="scroll-mt-20 bg-sunken"
        >
            <div className="mx-auto max-w-6xl px-4 py-24">
                <SectionTitle>按分类逛逛</SectionTitle>
                <p className="mt-2 text-muted-foreground">分类浏览即将上线，先看看都有什么。</p>

                <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3">
                    {CATEGORIES.map((cat, i) => (
                        <m.div
                            key={cat.name}
                            className="group"
                            custom={i}
                            variants={STAGGER}
                            initial={reduce ? false : "hidden"}
                            whileInView="show"
                            viewport={{ once: true, amount: 0.2 }}
                        >
                            <Card className="transition-transform duration-300 hover:-translate-y-1">
                                <CardContent>
                                    <cat.icon className="size-6 text-muted-foreground transition-transform duration-300 group-hover:scale-110" />
                                    <h3 className="mt-4 font-semibold">{cat.name}</h3>
                                    <p className="mt-1 text-muted-foreground">
                                        {cat.subs.join(" / ")}
                                    </p>
                                </CardContent>
                            </Card>
                        </m.div>
                    ))}
                </div>
            </div>
        </section>
    )
}

function SellerBanner() {
    return (
        <section className="mx-auto max-w-6xl px-4 py-24">
            <Reveal className="flex flex-col items-start gap-4 rounded-2xl bg-primary-subtle p-8 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                    <Store className="mt-1 size-8 shrink-0 text-primary" />
                    <div className="space-y-1">
                        <h2 className="text-2xl font-bold tracking-tight text-primary-subtle-foreground">
                            0 元开店，让好生意被更多人看见
                        </h2>
                        <p className="text-primary-subtle-foreground/80">
                            免费创建店铺，审核通过即可上架商品，开始经营。
                        </p>
                    </div>
                </div>
                <Link
                    to="/sell"
                    className={buttonVariants({ size: "lg" })}
                >
                    免费开店
                    <ArrowRight className="size-4" />
                </Link>
            </Reveal>
        </section>
    )
}
