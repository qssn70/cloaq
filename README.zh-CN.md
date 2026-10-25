# Cloaq 浏览器扩展

**语言：** [English](./README.md) | 简体中文

Cloaq 是一款适用于 Chrome / Edge 等 Chromium 浏览器的地区环境配置扩展，可以按网站调整**时区、语言环境和地理位置**。它适用于地区兼容性测试，也可辅助检查代理出口 IP 与网页读取到的地区信息是否一致。

> **注意：** Cloaq **不会修改公网 IP**，也不保证所有指纹不可检测或每个页面脚本都能在运行前获得修改后的值。要改变出口 IP，需要另行配置 VPN 或代理。

## 功能

- **按网站启用：** 在 `Activation` 中选择 `All sites` 或 `Only specified sites`，使用网站列表勾选、添加域名；默认仅匹配完整主机名；开启 `Include subdomains` 可包含直接子域名，再开启 `Include all subdomains` 可包含任意层级的子域名。
- **全局与独立配置：** 在 `Configuration → Applies To` 中选择 `All sites`（全局默认值）或 `This site`（当前网站）。网站独立配置优先；点击 `Reset to Global` 可删除该网站的覆盖记录，重新继承全局设置。
- **配置预设：** 支持 `Browser Default`、`Custom`、`Match This Site IP Address` 和内置地区预设；可修改时区、Locale、纬度和经度。
- **按当前网站出口 IP 匹配：** 对支持 Cloudflare `/cdn-cgi/trace` 的网站，尝试读取该网站实际观察到的 IP，再查询其地区信息；不以第三方查 IP 网站所使用的出口作为当前网站 IP。其他网站可手动输入已确认的出口 IP。
- **CDP 地区模拟：** 使用 `chrome.debugger` 设置时区、语言环境、地理位置，并尝试为跨进程 iframe、Worker 等子目标应用配置。不同浏览器和页面可能存在覆盖限制。
- **调试器恢复：** 显示连接状态，异常断开后有限次重试；还提供手动重连入口。与 DevTools 或其他调试扩展冲突时，可能无法附加。
- **指纹自检：** 对比网页可读取的 JavaScript 时区、语言信息和可获得的同站点出口 IP，并区分匹配、不匹配和无法验证。HTTP `Accept-Language`、地理位置权限及所有子目标覆盖**不能仅凭自检视为已验证**。

## 安装

### 方式一：GitHub Actions 构建产物（建议用于本仓库版本）

1. 打开 [GitHub Actions](https://github.com/qssn70/cloaq/actions)，选择一次成功的 `CI (yarn build)` 运行。
2. 在页面底部的 Artifacts 下载 `build`（浏览器未打包扩展，GitHub 会自动打包为 ZIP）。
3. 解压后，打开 Chrome 的 `chrome://extensions/` 或 Edge 的 `edge://extensions/`。
4. 开启**开发者模式**，选择“加载已解压的扩展程序”，选中包含 `manifest.json` 的目录。

同一次 CI 还会上传 `cloaq-crx`，其中包含 `cloaq.crx`（CRX3 格式）。现代 Chrome / Edge 对从非商店来源直接安装 CRX 有限制，**能成功打包不等于可以双击安装**；本地测试优先使用上述未打包版本。

> [Chrome 应用商店中的原项目页面](https://chromewebstore.google.com/detail/fcalilbnpkfikdppppppchmkdipibalb) 可能不是本仓库的最新修改版。

### 方式二：从源代码构建

需要 Node.js、Yarn，以及支持脚本中的 `rm` / `cp` 等命令的环境（例如 Linux、macOS 或 WSL）。CI 使用 Node.js 24。

```bash
git clone https://github.com/qssn70/cloaq.git
cd cloaq
yarn install --frozen-lockfile
yarn test
yarn build
```

构建完成后，按上面的方式在扩展程序页面加载 `build/`。开发过程中可使用 `yarn watch:css` 监视 CSS 变化。

## 使用说明

### 1. 选择在哪些网站启用

打开扩展弹窗，在 **Activation** 中选择：

- `All sites`：在支持的网站上启用扩展。
- `Only specified sites`：仅在勾选的网站上启用；可以从当前打开的网站列表选择，也可以手动添加域名。

在 Selected sites 中，勾选 `example.com` 后：默认仅启用 `example.com`；开启 `Include subdomains` 后启用 `a.example.com` 等直接子域名；再开启 `Include all subdomains` 后还会启用 `b.a.example.com` 等深层子域名。旧版已开启子域名包含的设置会保持原有的递归匹配效果。这个开关只控制**启用范围**，不会自动把父域名的独立配置复制给子域名。

### 2. 选择修改哪套配置

在 **Configuration → Applies To** 中选择：

- `All sites`：编辑全局默认配置。
- `This site`：编辑当前网站的独立配置。未建立独立配置时，网站继承全局默认值。

在 **Preset** 选择地区预设或手动输入时区、Locale、经纬度。已存在站点覆盖时，使用 `Reset to Global` 将其删除；这不会把该网站从 Activation 白名单中移除。

### 3. 匹配当前网站的出口 IP

1. 先打开需要配置的网站。
2. 在 Configuration 中选择 `Match This Site IP Address`。
3. 若网站提供兼容的 Cloudflare `/cdn-cgi/trace` 接口，扩展将尝试取得该网站看到的出口 IP，并通过 `ipapi.co` 查询其地区信息。
4. 如果无法检测，可以在输入框手动填入该网站实际使用的 IPv4 / IPv6 地址，然后点击 `Use IP`。

成功匹配会保存为**当前网站的独立配置**，不会覆盖全局默认配置；查询失败不会拿其他网站的出口 IP 代替。代理节点或分流规则变更后，应重新匹配。

**隐私说明：** 地区查询会把要查询的 IP 发送给 `ipapi.co`。自动识别出口 IP 时会请求当前网站自身的 `/cdn-cgi/trace`。

### 4. 查看自检结果与调试器状态

- `Fingerprint Self-Check → Check this site`：显示可观测项目的匹配情况；`unknown` 表示无法可靠验证，不代表通过。
- `Debugger Status`：查看连接状态；必要时点击 `Retry debugger connection`。
- 如果刚修改配置但当前网页没有更新，可以重新加载页面并再次自检。

## 关于顶部的浏览器调试提示

Cloaq 使用 Chrome Debugger API，因此浏览器可能显示“某扩展正在调试此浏览器”的提示栏。这是浏览器安全机制，不是网页弹窗。

Chromium 提供 `--silent-debugger-extension-api` 启动参数，用于隐藏该提示。例如在 Linux 终端中启动 Edge：

```bash
microsoft-edge-stable --silent-debugger-extension-api
```

**安全提醒：** 此参数会隐藏相关调试警告，并不阻止网站从其他行为推断出环境修改，也不会让指纹伪装变得不可检测。只在自己信任的浏览器环境中使用。

## GitHub Actions 与 CRX 签名

CI 在推送到 `main`、向 `main` 提交 PR 和手动触发时执行构建、测试与 CRX3 打包：

| Artifact | 内容 |
| --- | --- |
| `build` | 已解压扩展文件，供“加载已解压的扩展程序”使用 |
| `cloaq-crx` | 包含 `cloaq.crx` 的 ZIP |

如需让**正式构建**在不同版本中保持相同扩展 ID，可在仓库的 GitHub Actions Secrets 中添加 `CRX_PRIVATE_KEY_BASE64`（RSA 私钥 PEM 内容的 Base64 编码）。Linux 生成示例：

```bash
openssl genrsa -out cloaq-private.pem 2048
base64 -w0 cloaq-private.pem
```

将输出保存到 `Settings → Secrets and variables → Actions → New repository secret`。**不要将私钥提交到仓库或作为构建产物上传。** PR 构建不会使用该 Secret；没有固定密钥时，CI 会生成临时密钥，扩展 ID 可能随构建改变。自建密钥也不能保证获得 Chrome 应用商店原版扩展的 ID。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `debugger` | 使用 CDP 模拟地区环境，并监控调试会话 |
| `webNavigation` | 监听页面导航，以便按网站切换配置 |
| `storage` | 保存全局、站点和启用列表设置 |
| `tabs`、`activeTab` | 获取当前网页及候选网站的信息 |
| `scripting` | 在当前网页上下文中检测地区信息和同站点 IP |
| `alarms` | 调试器异常断开后安排有限次数的重连 |
| `https://ipapi.co/*` | 对指定 IP 查询地理位置数据 |

## 已知限制

- 目前自动识别**当前网站出口 IP**主要依赖 Cloudflare 的同站点回显接口，不支持的网站需自行确认 IP。
- 扩展不能修改网络出口 IP，也不能保证网页、跨进程 iframe、所有 Worker 或首次导航请求中的每项信息完全一致。
- 某些 CDP 命令在特定目标上可能不受支持；遇到调试器争用时，伪装可能不生效。
- 自检只能验证实际可观测的部分，不是对“不可检测”或“完全防追踪”的认证。

## 许可证

本仓库声明采用 [GPL-3.0-only](https://spdx.org/licenses/GPL-3.0-only.html) 许可证。
