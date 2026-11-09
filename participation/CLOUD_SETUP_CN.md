# RAT & CITY：云端已接通

这份网页已配置真实 Supabase 项目，打开后始终连接云端真实数据，已移除 Responses 和 Demo／Live 切换。无需再填写连接参数或执行 SQL。

| 项目 | 当前配置 |
|---|---|
| 项目名 | rat-city |
| 所属组织 | Bai Le's Org |
| 区域 | 美国东部 us-east-1 |
| Dashboard | https://supabase.com/dashboard/project/kdumywidhbmimzdigcgo |
| 公开反馈表 | public.rat_feedback |
| 服务器投稿入口 | rat-city-submit |
| 创建时服务报价 | 每月 0 美元 |

## 现在怎么使用

1. 解压完整文件包，双击 index.html 可测试；也可用 VS Code Live Server。
2. 页面只显示云端投稿。所有 Submit 都提交到服务器，没有本地演示提交分支；失败时保留输入并提示错误。
3. 搜索社区或 ZIP，在小地图确认区域，选择影响程度，填写可选评论并提交。
4. 服务器确认保存后才会显示成功。其他用户打开同一版本网页即可读取相同数据，已打开页面通过实时连接更新；断线时每 15 秒重新读取。
5. 要给所有人通过网址访问，请把完整目录替换到你们已有的 GitHub Pages 项目。云端数据库已经部署，但本文件包本身不是公开网页网址；目前尚未替换你们的 GitHub Pages 文件。

Live 数据不足 5000 条时，地图使用 1 dot = 1 response，让第一条真实反馈也能显示。点位仍是 ZCTA 内的示意位置，不是投稿人的精确地点。

## 已验证什么

真实 Supabase 测试已通过：

- 用两个独立客户端连接项目；一个提交，另一个收到 Realtime 事件并读取到相同评论。
- 刷新读取能拿到服务器保存的数据。
- 重试相同请求不会重复计数。
- 浏览器不能直接写表、修改或删除他人记录，也不能直接调用内部数据库写入函数。
- 30 秒重复提交限制正常生效。
- 本地 PostgreSQL 验证了 ZIP、评分、评论长度及权限规则；模拟双端测试验证了离线保留输入、分页、所有表单提交进入云端，以及未连接时不会在本地增加反馈。
- 测试反馈已删除，正式 Live 数据从空表开始。安全检查没有告警；新建空表的两个索引尚未被使用，属于提示信息。

尚未从你们最终发布的组网站和实体手机完成界面联测。发布后应再在电脑／手机上各打开一次，验证跨设备显示。

## 数据与管理

Supabase Dashboard → Table Editor → rat_feedback，可查看、导出和管理真实反馈。

公开字段只有 id、zip、rating、comment、created_at。没有点击坐标或 GPS 字段。评论是公开投稿，避免填写个人信息。这里统计的是投稿条数，并非经过身份核验的独立居民人数。

Live 不使用虚构的 Rat Activity Index，也不会据此生成 Perception Gap 判断。已有模拟数据不再加载到页面。

每个浏览器会生成随机标识用于减少误点、快速重复提交；它不是个人身份认证。服务器的 30 秒限制不能阻止有意更换浏览器标识的刷数据行为。本方案适合目前的课程规模；若正式大规模开放，应另做反滥用、内容审核与服务端统计。

## 文件与维护

- cloud-config.js：已经填写 Project URL 和 Publishable key。该 key 可以随网页公开。
- cloud.js：读取、投稿、实时同步、去重与轮询恢复。
- supabase/setup.sql：数据库结构和权限的可重建副本。项目已经执行过，不需要你再运行。
- supabase/functions/rat-city-submit/index.js：已部署服务器入口的源码。它校验应用 key、请求大小与字段，再以服务器凭据调用受限数据库函数。服务器凭据只从服务端环境读取，不在下载包中。
- cloud-project.json：项目定位信息。
- vendor/supabase.js：固定版本 2.118.0，MIT，许可见 vendor/SUPABASE-LICENSE。

如果后来轮换 Publishable key，需要同时更新 cloud-config.js 与服务器函数中的 PUBLIC_BROWSER_KEY 并重新部署函数。

参考文档：

- https://supabase.com/docs/guides/realtime/postgres-changes
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index
