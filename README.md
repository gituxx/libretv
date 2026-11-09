# LibreTV · oinnn 定制版

基于 LibreTV 的开源影视聚合搜索与播放网站，使用 Next.js 16、TypeScript、React、Tailwind CSS 和 ArtPlayer。完整应用源码、测试、Docker 配置及 Cloudflare Workers 部署工作流均在本仓库。

- 在线网站：[libretv.oinnn.top](https://libretv.oinnn.top/)
- 源码仓库：[gituxx/libretv](https://github.com/gituxx/libretv)
- 默认 TVBox 订阅：[tvbox.json](https://tvbox.oinnn.top/tvbox.json)
- 开源许可证：[GNU AGPL v3](LICENSE)，保留上游许可证及相关声明。

本分支保留上游历史与署名，维护自己的定制功能，已停止自动合并上游代码。原项目和参考资料见 [LibreSpark/LibreTV](https://github.com/LibreSpark/LibreTV)、[LibreTV-Next 文档](https://github.com/bestZwei/LibreTV-Next/wiki)；此前保留的上游 README 见 [docs/UPSTREAM_README.md](docs/UPSTREAM_README.md)。

## 定制功能

- 默认免密码访问；未设置 `PASSWORD` 时也能使用。公开部署不会把 HTTP 503 服务错误当成密码配置错误。
- 读取 TVBox 订阅，导入本应用支持的标准 CMS 点播接口；TVBox 的 JAR、Python、JS 等爬虫源不能直接在浏览器中运行。
- 跨源聚合搜索，按批次并发并逐源显示结果；流式读取不可用时回退为普通 JSON 请求。
- 当前线上配置默认使用豆瓣推荐，提供电影和电视剧切换。
- 搜索结果直接进入播放页，支持续播、观看历史、收藏和自动播放下一集。
- 播放后在后台准备换源候选，按接口响应耗时排序；换源结果使用紧凑列表显示。
- 每 20 集分页展示剧集，简介放在剧集列表下面。
- 每日自动部署，发布前实际启动 Worker，检查首页、播放页及无 Cookie 的免密访问。

接口响应耗时用于比较接口速度，不代表视频画面相对直播台的端到端延迟。影片是否能播放也取决于第三方源、网络和浏览器解码支持。

## 本地运行

需要 Node.js 22 和 npm。

```sh
git clone https://github.com/gituxx/libretv.git
cd libretv
npm ci
npm run dev
```

打开 `http://localhost:8080`。在设置中添加数据源或订阅；可使用上面的 TVBox 地址，应用会导入其中兼容的 CMS 接口。

生产构建与启动：

```sh
npm run build
npm start
```

观看历史和收藏保存在浏览器 IndexedDB，偏好保存在 localStorage。

## Docker 源码部署

```sh
docker compose up -d --build
```

默认构建本仓库的定制代码并监听 8080 端口，无需密码。可参考 [.env.example](.env.example) 配置 `.env`。上游发布的镜像不包含本仓库的全部定制修改。

## Cloudflare Workers

也可以在飞牛 NAS 上运行 Docker，并通过 Cloudflare Tunnel 提供独立公网入口，详见 [NAS 部署说明](deploy/nas/README.md)。

线上使用 [OpenNext Cloudflare](https://opennext.js.org/cloudflare) 适配 Next.js，配置见 [wrangler.jsonc](wrangler.jsonc) 和 [open-next.config.ts](open-next.config.ts)。

部署自己的实例：

1. Fork 或克隆本仓库，并启用 GitHub Actions。
2. 修改 `wrangler.jsonc` 中的 Worker 名称、`WORKER_SELF_REFERENCE.service` 和自定义域名路由；预置订阅和推荐源也在该文件中。
3. 在仓库的 Settings → Secrets and variables → Actions 中配置 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN`。Token 需要目标账户的 Workers Scripts 写入权限；配置域名路由时还需相应区域权限。
4. 手动运行 `Daily deploy LibreTV` 工作流，或推送到 `main`。

工作流每天北京时间 02:30 自动运行。它安装依赖、检查类型、运行回归测试、构建 Worker、启动本地 Worker 检查免密访问，然后部署并检查线上站点。GitHub 定时任务可能存在排队延迟。

默认预置订阅是 `https://tvbox.oinnn.top/tvbox.json`。应用中的订阅刷新与站点部署是两条流程：订阅内容由订阅服务更新，浏览器按应用的订阅同步逻辑读取新内容。

手动构建和预览 Worker：

```sh
npx opennextjs-cloudflare build
npx opennextjs-cloudflare preview --port 8787
node scripts/check-public-access.mjs http://127.0.0.1:8787
```

Cloudflare 工具链优先在 Linux 或 WSL 中运行。`next`、`@opennextjs/cloudflare` 和 `wrangler` 应配套升级；提交并使用 `package-lock.json`，发布前实际启动 Worker 验证。

## 常用配置

| 变量 | 用途 |
| --- | --- |
| `PUBLIC_ACCESS` | `true` 时公开访问，即使部署环境留有旧密码也不要求登录。当前 Cloudflare / Compose 配置默认开启。 |
| `PASSWORD` | 可选访问密码；未设置时公开访问。需要启用密码时同时设置 `PUBLIC_ACCESS=false` 和非空 `PASSWORD`。 |
| `PROXY_SECRET` | 可选的会话签名密钥；启用密码并使用多个实例时可显式配置。 |
| `COOKIE_SECURE` | 覆盖登录 Cookie 的 Secure 属性；当前 HTTPS 站点设置为 `true`。 |
| `DEFAULT_SUBSCRIPTIONS` | 预置订阅 URL 的 JSON 数组。 |
| `DEFAULT_SOURCES` | 预置 CMS 点播源的 JSON 数组。 |
| `DEFAULT_LIVE_SOURCES` | 预置 M3U 直播订阅的 JSON 数组。 |
| `DEFAULT_RECOMMEND_SOURCE` | 推荐数据源：`douban`、`bangumi` 或 `hot-list`。当前线上为 `douban`。 |
| `REQUEST_TIMEOUT` / `MAX_RETRIES` | 请求超时（毫秒）与重试次数。 |

示例及其它配置见 [.env.example](.env.example)、[docker-compose.yml](docker-compose.yml) 和上游参考文档。

## 代码结构

```text
src/app/                页面和 API 路由
src/components/         播放器、换源、搜索、收藏等组件
src/lib/                数据源解析、鉴权、存储、请求和工具函数
public/                 静态资源
scripts/                发布检查等维护脚本
.github/workflows/      自动测试、构建和部署
Dockerfile              Docker 源码构建
wrangler.jsonc          Cloudflare Worker 配置
```

## 检查与发布

```sh
npm run typecheck
npm test
npm run build
```

测试中的外部源请求使用模拟数据。发布修改时提交源码和锁文件，推送至 `main` 后由 GitHub Actions 部署；Cloudflare 凭证通过 Actions Secrets 注入。

本项目聚合和播放外部数据源，不包含视频文件。基于本项目修改、分发或提供网络服务时，请遵守 [LICENSE](LICENSE) 中的 GNU AGPL 条款。
