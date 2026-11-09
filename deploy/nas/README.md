# 飞牛 NAS Docker + Cloudflare Tunnel

这一部署与 Cloudflare Worker 实例独立。网站在 NAS 上运行，Cloudflare Tunnel 提供 HTTPS 公网入口，不需要路由器端口映射。

默认部署目录是 `/vol1/docker/libretv-nas`，局域网端口为 `18080`。目录内的 `project/` 是本仓库的克隆，`.env` 是本机配置，`.secrets/tunnel-token` 保存隧道凭证；凭证不进入 Git 或镜像。

## 安装

1. 在 NAS 上准备 Git、Docker Compose、Python 3 和可用的 Docker 镜像下载网络。
2. 创建部署目录并克隆本仓库到 `project/`，将本目录的 `update.sh` 复制到部署根目录。
3. 将本目录的 `.env.example` 复制到部署根目录的 `.env`，按实际用户调整 `NAS_UID`、`NAS_GID`，并按需修改端口和订阅。
4. 创建一个远程管理的 Cloudflare Tunnel，将新域名的 HTTP 服务配置为 `http://libretv:8080`，最后一条 ingress 使用 `http_status:404`。DNS 使用指向该 Tunnel 的代理 CNAME。
5. 将该隧道 token 存入部署目录 `.secrets/tunnel-token`。目录权限设为 `700`、文件权限设为 `600`，所有者应与 `.env` 的 `NAS_UID` / `NAS_GID` 一致。
6. 在部署根目录运行 `bash update.sh`。脚本先构建并检查候选容器，再启动正式服务和隧道；检查失败时恢复已有镜像。

## 每日更新

在 NAS 计划任务中每天运行一次 `update.sh` 即可。脚本使用文件锁避免重复执行，拉取的是本仓库的 `main`，不会合并原作者代码；只有新提交缺少本地镜像时才重新构建。构建采用单个 Next.js worker，适合小内存 ARM64 NAS。cloudflared 镜像也会检查更新。

`deployment.json` 记录最近成功的提交和更新时间。容器日志最多保留 3 份、每份 10 MiB；计划任务的输出日志可单独配置轮转。下载、构建或检查失败会写入日志，已有运行实例在切换前保持可用。切换后的检查失败会尝试恢复上一版镜像。

## 常用命令

```sh
cd /vol1/docker/libretv-nas
bash update.sh
sudo docker compose -p libretv-nas -f compose.yml ps
sudo docker compose -p libretv-nas -f compose.yml logs --tail 80
cat deployment.json
```

查看网页时可以使用 `http://NAS的局域网地址:18080` 或配置的公网域名。历史、收藏等仍保存在各自浏览器中。
