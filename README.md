# Cloaq Extension

**Languages:** English | [简体中文](./README.zh-CN.md)

**Chrome Download:** https://chromewebstore.google.com/detail/fcalilbnpkfikdppppppchmkdipibalb

Cloaq is a browser extension that spoofs your time zone, geolocation, and locale to any location you choose. It’s useful for testing websites in different regions, bypassing geo-restrictions, or matching your location data to your VPN IP address.

## How Cloaq Works

Cloaq uses the chrome.debugger API to change data directly at the browser level, making it effective across all frames and web workers, unlike other extensions that rely on less reliable script injections. This approach ensures data modifications are undetectable and work consistently, even during the initial page load.

## IP Address

Cloaq does not change your IP address. To change your IP address you will need a VPN or proxy.

## Hide Debugging Notification Bar

While the extension is on, a notification bar becomes visible. Hiding the bar can be done by using the --silent-debugger-extension-api flag.

Instructions on how to run chrome with flags:

https://www.chromium.org/developers/how-tos/run-chromium-with-flags/

## Permission Justification

Chrome permissions define the specific browser capabilities and user data that an extension can access.

**debugger:** Enables the extension to attach to tabs and emulate user settings such as location, time zone, and locale.

**webNavigation:** Enables the extension to attach the debugger to pages and monitor page transitions.

**storage:** Enables the extension to store and retrieve settings and preferences.

## Screenshot

<img src="https://raw.githubusercontent.com/www1z4rd/cloaq/refs/heads/main/promo/screenshot_2.png" alt="Screenshot" />

## Development

Cloaq is built using JavaScript and Tailwind CSS.

1. Clone this repository to your local machine.

2. Run the following command to install necessary packages:

```
yarn
```

3. Build the Extension.

```
yarn build
```

This command will build in the extension and place it in the /build folder.

### CI artifacts: unpacked build and CRX

GitHub Actions runs on pushes to `main`, pull requests targeting `main`, and manual workflow dispatches.
Each successful run uploads two artifacts (GitHub automatically wraps each download in a ZIP):

- `build`: the unpacked extension directory for Chrome's **Load unpacked** option.
- `cloaq-crx`: a Chrome-generated CRX3 package containing `cloaq.crx`.

To keep the CRX extension ID **stable across releases**, create one RSA private key locally and save
its **base64-encoded PEM contents** as the repository's GitHub Actions secret
`CRX_PRIVATE_KEY_BASE64`. For example, on Linux:

```sh
openssl genrsa -out cloaq-private.pem 2048
base64 -w0 cloaq-private.pem
```

Paste the base64 output into **Settings → Secrets and variables → Actions → New repository secret**.
Keep the PEM private: **never commit it or upload it as an Actions artifact**.
The signing secret is used only on `push` and manual runs; pull request builds deliberately
use a temporary key. Without the secret, CI still creates a CRX, but its extension ID changes
on each run, so it is suitable for testing rather than updating an existing installation.

A locally signed CRX is not necessarily accepted for direct installation in modern Chrome/Edge.
For local testing, the `build` artifact and **Load unpacked** option remain the most reliable route.
Using a new private key also does **not** reproduce a Chrome Web Store listing's existing extension ID.


### Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable 'Developer mode' (toggle in the upper-right corner).
3. Click 'Load unpacked'.
4. Select the `build` folder (or the root folder if using `yarn watch:css`).
