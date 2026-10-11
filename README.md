# NIke的网站

本地写作站点。前台只负责展示，后台用来写文章，文章保存在本机的 Go 接口里。

三个部分：

| 部分 | 目录 | 地址 |
| --- | --- | --- |
| 前台 | `www` | http://127.0.0.1:5173/#/ |
| 后台 | `admin` | http://127.0.0.1:5174/#/ |
| 接口 | `api` | http://127.0.0.1:8787 |

需要 Node.js 20 或更高版本、npm，以及 Go 1.26。

## 本地运行

在仓库根目录安装依赖：

```bash
npm install
```

后台的对话功能要读取根目录的 `.env`。不需要对话时可以跳过这一步。

```bash
cp .env.example .env
```

把 `.env` 里的 `CURSOR_API_KEY` 换成自己的密钥。这个文件不会提交到仓库。

Windows 用 Git Bash 在仓库根目录执行：

```bash
sh ./start.sh
```

脚本会打开三个窗口，分别跑接口、前台和后台。关掉对应窗口就会停掉那一项。

也可以分开启动，都在仓库根目录执行：

```bash
cd api && go run .
cd www && npm run dev
cd admin && npm run dev
```

文章、分类和图片写在 `api/data`。这个目录不进仓库。接口第一次启动时，如果 `api/data/posts` 还是空的，并且项目上一级目录里的 `data/posts` 已有文章，会自动复制过来。

## 部署

接口只监听 `127.0.0.1`，适合放在自己的机器上，不对外直接暴露。

在仓库根目录构建前台和后台，并编译接口：

```bash
npm install
npm run build:www
npm run build:admin
cd api && go build -o blog-api .
```

构建结果在 `www/dist` 和 `admin/dist`。

在三台进程里运行。接口要在 `api` 目录启动，这样数据目录才是 `api/data`：

```bash
cd api && ./blog-api
npm run preview --prefix www
npm run preview --prefix admin
```

Windows 上接口程序名是 `blog-api.exe`。后台对话仍然读取仓库根目录的 `.env`。

前台和后台的预览服务会把 `/api/store` 转到 `http://127.0.0.1:8787`。访问地址与本地开发相同：前台 5173，后台 5174。

如果要放到一台服务器上给自己用，把上面三个进程留在本机，再用反向代理把两个预览端口转到外面。不要把 8787 直接公开到公网。
