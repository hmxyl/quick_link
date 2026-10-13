// 安装期健康检查: 请求本机 /api/health, 200 则退出码 0, 否则 1。
// 由安装器在启动服务后调用, 用于当场发现"服务已注册但应用起不来"(最常见是端口被占用)。
// 检查 HTTP 而不是 SCM 服务状态: 服务可能显示 RUNNING 而 Express 已经崩在 listen 上。
const http = require("http");

const port = parseInt(process.argv[2] || "3000", 10);

const req = http.get(
  { host: "127.0.0.1", port, path: "/api/health", timeout: 4000 },
  (res) => {
    res.resume();
    process.exit(res.statusCode === 200 ? 0 : 1);
  }
);

req.on("timeout", () => req.destroy(new Error("timeout")));
req.on("error", () => process.exit(1));
