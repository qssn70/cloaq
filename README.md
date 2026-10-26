# Cloaq

**Language:** English | [简体中文](./README.zh-CN.md)  
**Repository version:** v2.0 · Chrome / Microsoft Edge (Chromium)

Cloaq is a browser extension for configuring the **time zone, locale, browser language, and geolocation** reported to websites. You can apply a default configuration everywhere or use a different configuration for an individual site. It is useful for regional compatibility testing and for checking how website-visible location settings compare with a VPN or proxy's exit IP.

> [!IMPORTANT]
> **Cloaq does not change your public IP address.** Use a VPN or proxy for network routing. Cloaq cannot guarantee that every fingerprint is consistent, that overrides apply before every initial request, or that websites cannot detect an altered environment.

## Features

- **Choose where Cloaq is active.** Enable it on all supported websites or only on selected hostnames. Optionally include direct subdomains or all nested subdomains.
- **Global and site-specific settings.** Set a global default, override it for one hostname, or use **Reset to Global** to remove that site's override.
- **Presets and manual coordinates.** Choose a built-in location, return to **Browser Default**, or enter a custom time zone, locale, latitude, and longitude (including valid zero coordinates).
- **Match this site's exit IP.** For compatible Cloudflare-hosted sites, read the IP seen by the *current website*, then look up approximate location data. You can also provide a verified IP manually.
- **Browser-level CDP emulation.** Use Chrome's Debugger API to request time-zone, locale, language, and geolocation overrides, with best-effort coverage of supported iframe and Worker targets.
- **Debugger status and recovery.** Show connection problems, retry some unexpected detachments, and offer a manual reconnect button.
- **Fingerprint Self-Check.** Compare available page observations with the selected configuration while identifying checks that cannot be verified.

## Installation

### Option A — GitHub Actions build (recommended for this repository)

1. Open the [Actions page](https://github.com/qssn70/cloaq/actions) and choose a successful **CI (yarn build)** run from the desired revision.
2. Download the **`build`** artifact and extract the ZIP.
3. Open **`chrome://extensions/`** in Chrome or **`edge://extensions/`** in Microsoft Edge.
4. Enable **Developer mode**, select **Load unpacked**, and choose the extracted directory containing `manifest.json`.

The workflow also produces a **`cloaq-crx`** artifact containing a `cloaq.crx` file. Chrome/Edge may restrict direct installation of CRX files obtained outside their extension stores; **Load unpacked** is the most reliable method for local testing.

**Chrome Web Store:** [Original extension listing](https://chromewebstore.google.com/detail/fcalilbnpkfikdppppppchmkdipibalb). That listing is not necessarily updated with this repository's latest changes.

### Option B — Build from source

Cloaq uses JavaScript and Tailwind CSS. Install Node.js and Yarn; the CI workflow uses **Node.js 24**. The build script uses Unix-style shell commands, so use Linux, macOS, WSL, or a compatible shell.

```bash
git clone https://github.com/qssn70/cloaq.git
cd cloaq
yarn install --frozen-lockfile
yarn test
yarn build
```

Load the generated `build/` directory as an unpacked extension. For CSS development, run `yarn watch:css`.

## Configuration guide

### 1. Activation — choose the websites

In the popup, set **Activation** to one of the following:

- **All sites:** Apply Cloaq wherever the browser permits the extension to operate.
- **Only specified sites:** Activate Cloaq only for the hostnames checked under **Selected sites**. You can select open sites or enter a hostname/HTTP(S) URL manually.

The two subdomain options apply to the **Selected sites list as a whole**, not separately to each row. For a selected `example.com`:

| Selected sites settings | `example.com` | `a.example.com` | `b.a.example.com` |
| --- | :---: | :---: | :---: |
| Both switches off (default) | Yes | No | No |
| **Include subdomains** on | Yes | Yes | No |
| **Include subdomains** and **Include all subdomains** on | Yes | Yes | Yes |

Matching respects domain boundaries: selecting `example.com` does **not** activate Cloaq on `notexample.com` or `example.com.evil.test`. If a child hostname is enabled through its parent, you must change the parent selection or subdomain switches to exclude it; disabling the child checkbox alone cannot override the parent match.

**Upgrading from an earlier subdomain-toggle build:** Existing users who had the original **Include subdomains** switch enabled retain its former recursive behavior unless they choose direct-only matching.

> **Activation and Configuration are separate.** Including a subdomain makes Cloaq *active* there; it does **not** copy the parent hostname's site-specific location settings to that child. A subdomain uses its own exact-hostname override if one exists, otherwise the global configuration.

### 2. Configuration — global default or one site

Under **Configuration → Applies To**, choose:

- **All sites:** Edit the global default configuration.
- **This site:** Edit an override for the active website's hostname. If none exists, the website inherits the global default until you change a setting.

Under **Preset**, choose:

| Preset | Behavior |
| --- | --- |
| **Browser Default** | Do not request Cloaq's location overrides for that configuration |
| **Custom** | Enter a time zone, locale, latitude, and longitude manually |
| **Match This Site IP Address** | Attempt a site-specific exit-IP lookup and derive location values |
| **Location presets** | Fill the fields with the selected predefined location |

For manual values, use an IANA time-zone identifier such as `Asia/Tokyo` and a locale such as `ja-JP`. Latitude must be between −90 and 90; longitude between −180 and 180. A coordinate of `0` is valid.

When a site-specific override exists, **Reset to Global** deletes the override for **that hostname only**, restoring inheritance. It does not delete other site overrides or change the Activation allowlist.

### 3. Match the current site's exit IP

This feature helps when different websites use different proxy routes. It deliberately avoids assuming that an unrelated IP-check service sees the same exit IP as the website you are configuring.

1. Open the target website in the active tab.
2. Select **Match This Site IP Address** under **Preset**.
3. Cloaq attempts to retrieve the site's IP observation using a same-origin `/cdn-cgi/trace` endpoint. This currently works only when the website provides a compatible Cloudflare response.
4. If automatic detection fails, enter the exit IPv4/IPv6 address you independently confirmed for **that site**, then click **Use IP**.
5. Cloaq queries `ipapi.co` for approximate location information and saves a **site-specific** configuration after successful validation.

A failed detection does not intentionally replace the global settings with an unrelated IP's location. **Recheck after changing your VPN/proxy, split-tunneling rules, or exit server**, and reload the site if needed.

**Privacy:** A lookup sends the supplied or detected IP address to `ipapi.co`. Automatic detection also makes a request to the **current website's own** `/cdn-cgi/trace` endpoint. IP geolocation is approximate and may differ from the physical location of the exit server.

### 4. Debugger Status and Fingerprint Self-Check

**Debugger Status** indicates whether Cloaq currently has a debugger session for the tab. Use **Retry debugger connection** when an attachment fails. Cloaq attempts a limited number of delayed reconnects after certain unexpected detachments, but does not deliberately take over an existing DevTools or other extension's debugger session. An explicit user cancellation may require a manual retry.

Use **Fingerprint Self-Check → Check this site** to inspect:

- JavaScript time zone, `Intl` locale, and `navigator.language`;
- the current site's exit IP, where that site offers a compatible IP echo;
- Cloaq's debugger attachment and reported iframe/Worker sessions;
- CDP command failures and compatibility notices.

The self-check distinguishes three result states:

| Result | Meaning |
| --- | --- |
| **pass** | The tested observable value matches the expectation |
| **mismatch** | The tested observable value or command outcome differs from expectations |
| **unknown** | The item was not independently verified; **not** proof of success or failure |

In particular, **HTTP Accept-Language** may remain `unknown` because the website does not echo the actual request header. **Geolocation** is not read because doing so could request website location permission. **Child frame / Worker coverage** remains `unknown` because an attached CDP session does not prove every execution context was covered.

After changing a location setting, **reload the webpage** and run the self-check again. JavaScript values can otherwise reflect an already-running page.

## How it works and what it cannot guarantee

Cloaq uses `chrome.debugger` and the Chrome DevTools Protocol (CDP) rather than only modifying JavaScript properties through content-script injection. It requests supported time-zone, locale, language, and geolocation emulation for the main page and attempts to configure supported subtargets such as cross-process iframes and Workers.

For language emulation, Cloaq requests a browser-language override while attempting to preserve the browser's original User-Agent and available User-Agent Client Hints. Worker targets support a different subset of CDP commands; a short-lived Worker may disappear before all commands finish. These conditions are handled separately from genuine command failures where possible.

**Important limits:**

- It does **not** change your IP address, proxy rules, DNS routing, or physical location.
- Some requests or early-running scripts may execute before an override takes effect; coverage across all frames, Workers, and browser versions cannot be guaranteed.
- A successful JavaScript self-check does not validate every network header or server-side observation.
- Websites may inspect additional signals outside Cloaq's scope. **Cloaq is not an undetectability, anonymity, or anti-tracking guarantee.**
- The Chrome debugger may conflict with DevTools or other extensions using the same target.
- Some targets do not implement every emulation command; a compatibility notice is not automatically evidence of a fingerprint mismatch.

### Browser debugging notification

When an extension uses the Debugger API, Chromium may show a visible debugging notification bar. This is expected browser behavior.

Chromium has a `--silent-debugger-extension-api` startup flag that may suppress this browser warning. Consult [Chromium's flag instructions](https://www.chromium.org/developers/how-tos/run-chromium-with-flags/) for your browser and platform. **Suppressing the warning reduces visibility into debugging access and does not make Cloaq undetectable.** Use it only if you understand that trade-off.

## Permissions

| Permission | Why Cloaq requests it |
| --- | --- |
| `debugger` | Attach CDP sessions and request browser-level emulation |
| `webNavigation` | Respond to page navigation and changes of website |
| `storage` | Save global settings, per-site overrides, and activation choices locally |
| `tabs` / `activeTab` | Identify the active tab and candidate hostnames |
| `scripting` | Run page-context self-checks and same-site exit-IP detection |
| `alarms` | Schedule limited debugger-reconnect attempts |
| Host access to `https://ipapi.co/*` | Retrieve approximate geolocation for a selected IP |

## CI artifacts and CRX signing

GitHub Actions runs on pushes to `main`, pull requests targeting `main`, and manual workflow dispatches. Successful runs upload two artifacts (each downloaded as a ZIP):

- **`build`:** Unpacked extension files for **Load unpacked**.
- **`cloaq-crx`:** A CRX3 package containing `cloaq.crx`.

For a consistent **self-built CRX extension ID**, configure a persistent RSA private key as the GitHub Actions secret `CRX_PRIVATE_KEY_BASE64`. One way to generate and encode it on Linux is:

```bash
openssl genrsa -out cloaq-private.pem 2048
base64 -w0 cloaq-private.pem
```

Copy the Base64 output to **Repository Settings → Secrets and variables → Actions → New repository secret**.

**Never commit, publish, or attach the private key as an Actions artifact.** The signing secret is used only for push and manual builds; pull-request builds intentionally use a temporary key. Without a configured secret, CRX builds still work, but their extension IDs can change between runs. A self-generated key also **cannot reproduce the Chrome Web Store listing's existing extension ID**.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `navigator.language` or `Intl` does not match | Reload the page after applying the setting; check **Debugger Status** and retry attachment if needed |
| Automatic exit-IP detection fails | The website may not expose a compatible `/cdn-cgi/trace` endpoint; verify that site's actual exit IP and use **Use IP** |
| A selected subdomain is not activated | Check **Include subdomains** and, for deeper levels, **Include all subdomains** |
| A subdomain uses the global location | Activation inheritance does not imply site-configuration inheritance; set an override on that exact hostname |
| Self-check displays `unknown` | Read its note: an unverified header, location permission, or Worker target does not automatically mean failure |
| Cloaq cannot attach the debugger | Close DevTools or resolve a competing debugger session; use **Retry debugger connection** |
| A CRX does not install or has a new extension ID | Use the unpacked `build` artifact, and check whether the same signing key was used |

## License

This repository declares the **[GPL-3.0-only](https://spdx.org/licenses/GPL-3.0-only.html)** license in its package metadata.
