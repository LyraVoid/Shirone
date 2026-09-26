---
title: RSS 订阅推荐
published: 2026-09-27
publishedAt: 2026-09-27T01:52:15+08:00
description: '我使用的 RSS 订阅源分享'
image: ''
tags: [RSS]
category: '软件'
draft: false 
lang: ''
---

RSS 我认为是一个通过制造“信息茧房”（只从订阅源获取信息）来破除“信息茧房”（流媒体应用推荐）的工具

## RSS 客户端

“工欲善其事，必先利其器”一个好的 RSS 工具是我们使用 RSS 的前提

- **GNU/Linux**
  - [Newsflash](https://github.com/patchedsoul/news-flash)
  - [Akregator](https://apps.kde.org/akregator/) （不推荐，界面比较混乱）

- **Android**
  - [ReadYou](https://github.com/ReadYouApp/ReadYou)

- Windows
  - [FluentReader](https://github.com/yang991178/fluent-reader)

*本文是 RSS 基础教程，所以 RSSHub 就不教啦~

## 我在用的 RSS 订阅源

- 默认

- 科技新闻
  - [IT之家](https://www.ithome.com/rss/)
  - [電腦領域 HKEPC Hardware](https://www.hkepc.com/feed)
  - [小道消息](https://plink.anyfeeder.com/weixin/WebNotes)
  - [科技美学](https://plink.anyfeeder.com/weixin/kejimx)
  - [爱范儿](https://www.ifanr.com/feed)
  - [少数派](https://sspai.com/feed)
  - [阮一峰的网络日志](https://www.ruanyifeng.com/blog/atom.xml)
  - [36氪](https://www.36kr.com/feed)

- AI
  - [DeepSeek Service Status - Incident History](https://status.deepseek.com/history.rss)
  - [橘鸦AI早报](https://daily.juya.uk/rss.xml)

- 软件
  - [异次元软件世界](https://feed.iplaysoft.com/)
  - [小众软件](https://feeds.appinn.com/appinns/)
  - [Arch Linux](https://www.archlinuxcn.org/feed/)

- 其他
  - [ManyACG - ACG美图精选收集](https://manyacg.top/atom.xml)
  - [LINUX DO - 福利羊毛](https://linuxdorss.longpink.com/welfare.xml)

- 时势新闻
  - [中新网即时新闻](https://www.chinanews.com.cn/rss/scroll-news.xml)
  - [《联合早报》-国际-即时](https://plink.anyfeeder.com/zaobao/realtime/world)
  - [《联合早报》-中港台-即时](https://plink.anyfeeder.com/zaobao/realtime/china)
  - [人民日报](https://plink.anyfeeder.com/people-daily)

也可以使用 OPML 导入

```yaml
<opml version="2.0">
  <head>
    <title>NewsFlash OPML export</title>
  </head>
  <body>
    <outline text="默认" title="默认" />
    <outline text="科技新闻" title="科技新闻">
      <outline text="IT之家"
        type="rss"
        xmlUrl="https://www.ithome.com/rss/"
        htmlUrl="https://www.ithome.com/"
        title="IT之家" />
      <outline text="電腦領域 HKEPC Hardware"
        type="rss"
        xmlUrl="https://www.hkepc.com/feed"
        htmlUrl="https://www.hkepc.com/feed"
        title="電腦領域 HKEPC Hardware" />
      <outline text="小道消息"
        type="rss"
        xmlUrl="https://plink.anyfeeder.com/weixin/WebNotes"
        htmlUrl="http://weixin.sogou.com/weixin?type=1&amp;s_from=input&amp;query=%E5%B0%8F%E9%81%93%E6%B6%88%E6%81%AF"
        title="小道消息" />
      <outline text="科技美学"
        type="rss"
        xmlUrl="https://plink.anyfeeder.com/weixin/kejimx"
        htmlUrl="http://weixin.sogou.com/weixin?type=1&amp;s_from=input&amp;query=%E7%A7%91%E6%8A%80%E7%BE%8E%E5%AD%A6"
        title="科技美学" />
      <outline text="爱范儿"
        type="rss"
        xmlUrl="https://www.ifanr.com/feed"
        htmlUrl="https://www.ifanr.com/?utm_source=rss&amp;utm_medium=rss&amp;utm_campaign="
        title="爱范儿" />
      <outline text="少数派" type="rss" xmlUrl="https://sspai.com/feed" htmlUrl="https://sspai.com/feed" title="少数派" />
      <outline text="阮一峰的网络日志"
        type="rss"
        xmlUrl="https://www.ruanyifeng.com/blog/atom.xml"
        htmlUrl="http://www.ruanyifeng.com/blog/"
        title="阮一峰的网络日志" />
      <outline text="36氪" type="rss" xmlUrl="https://www.36kr.com/feed" htmlUrl="http://36kr.com/" title="36氪" />
    </outline>
    <outline text="AI" title="AI">
      <outline text="DeepSeek Service Status - Incident History"
        type="rss"
        xmlUrl="https://status.deepseek.com/history.rss"
        htmlUrl="https://status.deepseek.com/history.rss"
        title="DeepSeek Service Status - Incident History" />
      <outline text="橘鸦AI早报"
        type="rss"
        xmlUrl="https://daily.juya.uk/rss.xml"
        htmlUrl="https://daily.juya.uk/"
        title="橘鸦AI早报" />
    </outline>
    <outline text="软件" title="软件">
      <outline text="异次元软件世界"
        type="rss"
        xmlUrl="https://feed.iplaysoft.com/"
        htmlUrl="https://www.iplaysoft.com/"
        title="异次元软件世界" />
      <outline text="小众软件"
        type="rss"
        xmlUrl="https://feeds.appinn.com/appinns/"
        htmlUrl="https://www.appinn.com/"
        title="小众软件" />
      <outline text="Arch Linux"
        type="rss"
        xmlUrl="https://www.archlinuxcn.org/feed/"
        htmlUrl="https://www.archlinuxcn.org/"
        title="Arch Linux" />
    </outline>
    <outline text="其他" title="其他">
      <outline text="ManyACG - ACG美图精选收集"
        type="rss"
        xmlUrl="https://manyacg.top/atom.xml"
        htmlUrl="https://manyacg.top/atom.xml"
        title="ManyACG - ACG美图精选收集" />
      <outline text="LINUX DO - 福利羊毛"
        type="rss"
        xmlUrl="https://linuxdorss.longpink.com/welfare.xml"
        htmlUrl="https://linux.do/c/welfare/36"
        title="LINUX DO - 福利羊毛" />
    </outline>
    <outline text="时势新闻" title="时势新闻">
      <outline text="中新网即时新闻"
        type="rss"
        xmlUrl="https://www.chinanews.com.cn/rss/scroll-news.xml"
        htmlUrl="https://www.chinanews.com.cn/scroll-news/news1.html"
        title="中新网即时新闻" />
      <outline text="《联合早报》-国际-即时"
        type="rss"
        xmlUrl="https://plink.anyfeeder.com/zaobao/realtime/world"
        htmlUrl="https://www.zaobao.com/realtime/world"
        title="《联合早报》-国际-即时" />
      <outline text="《联合早报》-中港台-即时"
        type="rss"
        xmlUrl="https://plink.anyfeeder.com/zaobao/realtime/china"
        htmlUrl="https://www.zaobao.com/realtime/china"
        title="《联合早报》-中港台-即时" />
      <outline text="人民日报"
        type="rss"
        xmlUrl="https://plink.anyfeeder.com/people-daily"
        htmlUrl="http://www.people.com.cn/"
        title="人民日报" />
    </outline>
  </body>
</opml>

```