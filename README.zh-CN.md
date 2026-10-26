# Cloaq

**语言：** [English](./README.md) | 简体中文  
**仓库版本：** v2.0 · Chrome / Microsoft Edge（Chromium）

Cloaq 是一款浏览器地区环境配置扩展，可以调整网站读取到的**时区、语言环境（Locale）、浏览器语言和地理位置**。你可以为所有网站设置全局默认值，也可以针对某个网站单独配置。它适用于地区兼容性测试，以及检查网站读取到的地区信息与 VPN／代理出口 IP 是否协调一致。

> [!IMPORTANT]
> **Cloaq 不会改变公网 IP。** 如需改变网络出口，请使用 VPN 或代理。Cloaq 不保证所有指纹始终一致、不保证首次请求前所有覆盖都已生效，也不能保证网站无法识别环境修改。

## 主要功能

- **控制启用范围：** 对所有支持的网站启用，或只对勾选的网站启用；支持包含一级子域名或所有层级子域名。
- **全局与网站独立配置：** 设置全局默认值，为单个主机名单独覆盖；通过 **Reset to Global** 删除该网站覆盖并恢复全局继承。
- **地区预设和手动坐标：** 支持内置地区、**Browser Default** 和自定义时区、Locale、经纬度；经纬度 `0` 也是有效值。
- **匹配当前网站出口 IP：** 对提供兼容 Cloudflare 接口的网站，读取该网站观察到的出口 IP，再查询近似地理位置；也可手动填写经过确认的 IP。
- **原生 CDP 地区模拟：** 通过 Chrome Debugger API 请求时区、Locale、浏览器语言和地理位置覆盖，并尝试处理支持的 iframe 与 Worker 目标。
- **调试器状态与恢复：** 展示连接问题，在部分异常断开情形下有限次数重连，也可手动重试。
- **指纹自检：** 比较网页可观测的结果与预期设置，并明确区分已验证、一致性错误和无法验证的项目。

## 安装

### 方式一：使用 GitHub Actions 构建产物（推荐）

1. 打开 [GitHub Actions](https://github.com/qssn70/cloaq/actions)，选择所需版本对应的一次成功运行（**CI (yarn build)**）。
2. 下载 **`build`** Artifact 并解压 ZIP。
3. 在 Chrome 打开 **`chrome://extensions/`**，或在 Edge 打开 **`edge://extensions/`**。
4. 开启**开发者模式**，点击**加载已解压的扩展程序**，选择包含 `manifest.json` 的解压目录。

CI 还会上传 **`cloaq-crx`**，其中包含 `cloaq.crx`。Chrome / Edge 可能限制直接安装非官方扩展商店提供的 CRX 文件，因此本地使用本仓库版本时优先选择**加载已解压的扩展程序**。

**Chrome 应用商店：** [原扩展页面](https://chromewebstore.google.com/detail/fcalilbnpkfikdppppppchmkdipibalb)，其发布版本不一定包含本仓库最近的修改。

### 方式二：从源码构建

项目使用 JavaScript 和 Tailwind CSS。需要安装 Node.js 与 Yarn；CI 使用 **Node.js 24**。构建脚本使用 `rm`、`cp` 等 Unix 风格命令，建议使用 Linux、macOS、WSL 或兼容的 Shell。

```bash
git clone https://github.com/qssn70/cloaq.git
cd cloaq
yarn install --frozen-lockfile
yarn test
yarn build
```

构建完成后，在浏览器扩展管理页面加载 `build/` 目录。开发 CSS 时可执行 `yarn watch:css`。

## 使用指南

### 1. Activation：选择启用网站

打开扩展弹窗，在 **Activation** 中选择：

- **All sites：** 在浏览器允许的受支持网页上启用 Cloaq。
- **Only specified sites：** 仅在 **Selected sites** 列表中勾选的网站上启用。可以从已打开的网站中选择，或手动添加域名／HTTP(S) URL。

两个子域名选项作用于**整个 Selected sites 列表**，而不是针对每个网站分别设置。假设勾选了 `example.com`：

| Selected sites 设置 | `example.com` | `a.example.com` | `b.a.example.com` |
| --- | :---: | :---: | :---: |
| 两个开关均关闭（默认） | ✓ | ✗ | ✗ |
| 开启 **Include subdomains** | ✓ | ✓ | ✗ |
| 同时开启 **Include subdomains** 与 **Include all subdomains** | ✓ | ✓ | ✓ |

匹配会检查主机名边界：选择 `example.com` 不会错误匹配 `notexample.com` 或 `example.com.evil.test`。

如果某个子域名是通过父域名规则被包含的，仅取消子域名本身的勾选**不能覆盖父域名启用规则**。要将它排除，需要修改父域名的选择状态或关闭相应的子域名包含选项。

**旧配置兼容：** 旧版只有一个 **Include subdomains** 开关，开启时匹配所有子域名层级。已有用户会保留原来的递归匹配效果，除非主动改成仅匹配一级子域名。

> **Activation 与 Configuration 相互独立。** 包含某个子域名仅代表 Cloaq 在该网站**启用**，不意味着它会继承父域名的**独立地区配置**。子域名优先使用自己的精确主机名配置；没有时使用全局配置。

### 2. Configuration：全局默认值或单个网站

在 **Configuration → Applies To** 中选择：

- **All sites：** 修改全局默认配置。
- **This site：** 修改当前网站主机名的独立配置；若尚未建立独立配置，则在修改前继承全局默认值。

**Preset** 提供以下选择：

| 选项 | 含义 |
| --- | --- |
| **Browser Default** | 当前配置不请求 Cloaq 的地区覆盖 |
| **Custom** | 手动填写时区、Locale、纬度及经度 |
| **Match This Site IP Address** | 尝试根据当前网站看到的出口 IP 生成位置配置 |
| **Locations 地区预设** | 将选定地区的时区、语言及坐标填入表单 |

手动填写时区可使用 `Asia/Tokyo` 这样的 IANA 时区标识；Locale 可使用 `ja-JP`。纬度范围为 −90～90，经度范围为 −180～180，**`0` 不是空值**。

当网站已有独立覆盖时，点击 **Reset to Global** 可只删除**当前主机名**的覆盖记录，使其重新继承全局配置；其他网站设置和 Activation 白名单不会被删除。

### 3. 根据当前网站出口 IP 匹配地区

这个功能针对不同网站可能走不同代理线路的情况。它**不会假定第三方 IP 检测网站与当前网站使用相同的出口 IP**。

1. 在活动标签页打开需要配置的网站。
2. 在 **Preset** 中选择 **Match This Site IP Address**。
3. Cloaq 尝试访问当前网站同源的 `/cdn-cgi/trace` 接口，取得该网站观察到的出口 IP。目前需要网站提供兼容的 Cloudflare 响应。
4. 自动检测失败时，可手动输入已经核实为**该网站出口**的 IPv4／IPv6 地址，并点击 **Use IP**。
5. Cloaq 使用 `ipapi.co` 查询近似地理位置。查询与校验成功后，才会保存**当前网站的独立配置**。

查询失败时，不会故意用其他网站的出口 IP 覆盖全局配置。切换 VPN／代理节点、分流规则或出口服务器后，建议重新匹配；必要时刷新目标网页。

**隐私说明：** 地区查询会将检测到或手动填写的 IP 发送至 `ipapi.co`。自动识别还会请求**当前网站自身**的 `/cdn-cgi/trace`。IP 地理定位是近似结果，未必等于出口服务器的真实物理位置。

### 4. Debugger Status 与 Fingerprint Self-Check

**Debugger Status** 显示 Cloaq 是否已经为当前标签页附加调试会话。连接失败时可以点击 **Retry debugger connection**。部分异常断开会触发有限次数的延时重连；如果 DevTools 或其他扩展已占用该目标，Cloaq 不会主动抢占。用户主动取消调试后可能需要手动重试。

点击 **Fingerprint Self-Check → Check this site**，可以检查：

- JavaScript 时区、`Intl` Locale、`navigator.language`；
- 当前网站提供兼容 IP 回显时观察到的出口 IP；
- Cloaq 调试器连接状态，以及已发现的 iframe／Worker 会话；
- CDP 命令错误与兼容性提示。

自检采用三种状态：

| 结果 | 含义 |
| --- | --- |
| **pass** | 实际读取到的受检值与预期一致 |
| **mismatch** | 读取值或命令执行结果不符合预期 |
| **unknown** | 当前项目未被独立验证，**既不代表通过，也不代表失败** |

其中：

- **HTTP Accept-Language：unknown** —— 当前网站没有回显服务器实际收到的请求头；CDP 请求覆盖不等于已验证服务器接收结果。
- **Geolocation：unknown** —— 自检不会主动读取坐标，以避免触发网站地理位置授权提示。
- **Child frame / Worker coverage：unknown** —— 发现并附加调试会话，不等于已经验证每一个执行上下文。
- **CDP compatibility：unknown** —— 某些 Worker 会话短暂存在或不支持特定命令，这类兼容性提示与真正的命令失败分开记录。

修改地区配置后，建议**刷新网页再重新自检**；否则页面中已执行的脚本可能仍反映原状态。

## 工作原理与局限

Cloaq 使用 `chrome.debugger` 和 Chrome DevTools Protocol（CDP）请求浏览器层级的地区模拟，不仅依赖内容脚本修改 JavaScript 属性。它会对主页面应用支持的时区、Locale、语言及地理位置覆盖，并尝试为跨进程 iframe、Worker 等受支持目标设置可用的模拟命令。

在语言模拟方面，Cloaq 会请求浏览器语言覆盖，同时尽量保留原有 User-Agent 和可读取的 User-Agent Client Hints，避免为修改语言而无意改变浏览器身份。Worker 支持的 CDP 命令与普通页面不同；短生命周期 Worker 可能在命令执行过程中退出，因此扩展会尽量区分兼容性现象与真实故障。

**需要明确的限制：**

- Cloaq **不会改变公网 IP、代理路由、DNS 出口或真实物理位置**。
- 某些首次请求或很早执行的脚本，可能发生在地区覆盖生效之前；无法保证所有 iframe、Worker 和浏览器版本都被完整覆盖。
- JavaScript 自检通过，不等于所有网络请求头或服务器端观察结果都一致。
- 网站还可能检查 Cloaq 未处理的其他信号；**Cloaq 不提供“完全不可检测”“匿名”或“防追踪”的保证**。
- Chrome 调试器可能与 DevTools 或其他调试扩展冲突。
- 不同 CDP 目标并非支持全部模拟命令；兼容性提示本身不等于指纹不一致。

### 浏览器的调试提示栏

扩展使用 Debugger API 时，Chromium 可能显示“某扩展正在调试浏览器”之类的提示栏。这属于浏览器的正常安全提示。

Chromium 提供 `--silent-debugger-extension-api` 启动参数，在部分环境中可隐藏该提示。具体方法参见 [Chromium 启动参数说明](https://www.chromium.org/developers/how-tos/run-chromium-with-flags/)。

**注意：隐藏提示会降低用户对调试器访问的可见性，并不会让 Cloaq 变得不可检测。** 请在了解风险后自行决定是否使用。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `debugger` | 附加 CDP 会话，请求浏览器层级的地区模拟 |
| `webNavigation` | 监听网页导航，根据当前网站切换设置 |
| `storage` | 在本地保存全局配置、网站覆盖及启用列表 |
| `tabs`／`activeTab` | 获取活动标签页和候选网站信息 |
| `scripting` | 运行网页环境自检和同站点出口 IP 检测 |
| `alarms` | 在调试器异常断开后安排有限次数重连 |
| 访问 `https://ipapi.co/*` | 查询指定 IP 的近似地理位置 |

## GitHub Actions 构建与 CRX 签名

CI 在推送到 `main`、向 `main` 提交 PR 或手动触发时运行。成功后上传两个 Artifact（下载时均为 ZIP）：

- **`build`：** 已解压扩展目录，用于浏览器的**加载已解压的扩展程序**。
- **`cloaq-crx`：** 包含 `cloaq.crx` 的 CRX3 安装包。

要让**自行构建的 CRX** 在不同正式版本中使用稳定的扩展 ID，需要使用固定的 RSA 私钥，将其 Base64 编码后的 PEM 内容保存为 GitHub Actions Secret：`CRX_PRIVATE_KEY_BASE64`。

Linux 下生成示例：

```bash
openssl genrsa -out cloaq-private.pem 2048
base64 -w0 cloaq-private.pem
```

将 Base64 输出填入 **仓库 Settings → Secrets and variables → Actions → New repository secret**。

**切勿将私钥提交到 GitHub 仓库、公开发布或上传为构建产物。** 正常 push 和手动构建可以使用该 Secret；PR 构建故意使用临时密钥。没有配置固定密钥时，CI 仍可生成 CRX，但扩展 ID 可能每次都不同。自行生成密钥也**无法复现 Chrome 应用商店原扩展的 ID**。

## 常见问题

| 现象 | 建议检查 |
| --- | --- |
| `navigator.language` 或 `Intl` 不匹配 | 修改配置后刷新网页，确认 **Debugger Status**，必要时手动重连 |
| 自动检测出口 IP 失败 | 当前网站可能没有兼容的 `/cdn-cgi/trace`；确认该网站真实出口 IP 后使用 **Use IP** |
| 已勾选网站的子域名没有生效 | 检查 **Include subdomains**；更深层级还需 **Include all subdomains** |
| 子域名仍使用全局地区配置 | 启用范围继承不等于独立配置继承；要单独设置该子域名的主机名 |
| 自检显示 `unknown` | 查看提示信息：请求头、地理位置权限或 Worker 覆盖未验证，不等于错误 |
| 无法附加调试器 | 关闭 DevTools 或解决其他扩展的调试器占用，再使用 **Retry debugger connection** |
| CRX 无法安装或 ID 改变 | 优先使用 `build` 未打包版本，并检查是否沿用同一把签名密钥 |

## 开源许可证

本仓库的 `package.json` 声明使用 **[GPL-3.0-only](https://spdx.org/licenses/GPL-3.0-only.html)** 许可证。
