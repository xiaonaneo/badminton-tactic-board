# 安全审查报告

审查对象：`badminton-tactic-board` 静态站点及其 Netlify 配置

审查日期：2026-08-16

## 执行摘要

没有发现当前代码中可直接利用的高危或严重漏洞。站点没有后端、账号、接口或第三方运行时依赖；用户输入的标注文本通过 `textContent` 写入 SVG，没有发现 `innerHTML`、`eval`、动态脚本加载或不受控跳转。

本次已修复 SBP-001 与 SBP-002 的仓库配置：`netlify.toml` 已加入 CSP、点击劫持防护和通用安全响应头。配置需要下一次 Netlify 部署后才会在生产站点生效；本次未执行部署。

发现 2 项部署/防御性问题，以及 1 项低风险的客户端健壮性问题：线上未观察到 CSP；线上未观察到点击劫持防护头；本地战术状态恢复缺少数量和字段上限。它们目前都不能直接证明存在远程代码执行或数据窃取。

## 审查范围与方法

- 检查 `index.html`、`app.js`、`court.js`、`share-utils.js`、`styles.css`、`manifest.json`、`netlify.toml`。
- 搜索 DOM XSS、动态代码执行、不受控 URL、`postMessage`、存储敏感信息、第三方脚本和 DOM clobbering 模式。
- 执行 `npm test` 和 `npm run check`，结果通过。
- 对生产站点 `https://badminton-tactic-board-neo111282.netlify.app/` 做了一次 HTTP 响应头检查；该次响应为 `200`，服务器为 Netlify，并包含 HSTS。后续请求受本机代理端口不可用影响，未将其作为新的站点结论。

## 发现

### SBP-001：未配置 Content Security Policy

- 状态：已在 `netlify.toml:5-10` 修复，待部署后验证线上响应头。
- 规则 ID：`JS-CSP-001` / `JS-CSP-002`
- 严重性：Medium（防御缺失；当前没有证明可利用的 XSS 路径）
- 位置：`netlify.toml:1-2`、`index.html:1-90`
- 证据：Netlify 配置只有：

  ```toml
  [build]
    publish = "."
  ```

  HTML 中没有 `Content-Security-Policy` meta，仓库中也没有 `_headers` 或其他响应头配置。生产响应的已观察头中没有 `Content-Security-Policy`。

- 影响：如果未来加入一个 DOM 注入点、第三方脚本或被篡改的静态资源，浏览器缺少 CSP 这一层限制，XSS 或供应链问题的影响面会更大。按当前代码，未发现输入能到达 HTML 注入或动态代码执行。
- 修复：在 Netlify 响应头中加入严格、按实际资源收敛的 CSP。至少应限制 `default-src`、`script-src 'self'`、`object-src 'none'`、`base-uri 'none'`、`frame-ancestors 'none'`；`img-src` 需允许站点实际使用的 `data:`/`blob:`，并在部署后用浏览器验证不破坏 PNG 导出。不要加入 `unsafe-eval`；现有动态 style 属性需要单独评估，避免为了 CSP 直接破坏功能。
- 缓解：继续保持当前的 `textContent`、`createElement`/`createElementNS` 和事件监听器写法，不引入 `innerHTML`、内联事件处理器或远程脚本。
- 误报说明：CSP 可能在 Netlify 控制台或外部代理设置；本报告只确认仓库内没有配置，并基于一次线上响应检查报告未观察到该头。

### SBP-002：未观察到点击劫持防护

- 状态：已在 `netlify.toml:5-10` 修复，待部署后验证线上响应头。
- 规则 ID：`JS-CSP-001`
- 严重性：Low
- 位置：`netlify.toml:1-2`
- 证据：同一次生产响应检查未观察到 `Content-Security-Policy: frame-ancestors ...` 或 `X-Frame-Options`。HTML 也没有可替代的防护；即使使用 meta，`frame-ancestors` 也不能依赖 meta 生效。
- 影响：第三方页面可以尝试把战术板嵌入 iframe，并诱导用户点击。由于当前站点没有账户、交易或服务器端敏感操作，实际影响主要是误操作和界面欺骗，不是数据泄露。
- 修复：在 Netlify headers 中设置 `Content-Security-Policy: frame-ancestors 'none'`；如需兼容旧浏览器，再加 `X-Frame-Options: DENY`。如果产品未来需要被嵌入，应改为明确允许的来源，而不是放开所有来源。
- 缓解：不要在页面中加入会改变账户、权限、付款或外部资源状态的操作，除非同时完成来源和点击劫持防护设计。
- 误报说明：需要在 Netlify 控制台、CDN 或反向代理上确认是否有未提交到仓库的头配置。

### SBP-003：本地状态恢复缺少大小和字段边界

- 规则 ID：`JS-STORAGE-001`（扩展为输入健壮性检查）
- 严重性：Low
- 位置：`app.js:170-200`、`app.js:665-672`、`app.js:757-760`
- 证据：

  ```js
  const saved = localStorage.getItem('badminton-tactic-board:v1');
  if (saved) restore(JSON.parse(saved));
  ```

  `restore()` 只检查 `version` 和 `items` 是否为数组，随后按数组内容创建 SVG 节点；没有限制对象总数、标注文本长度、画笔路径长度，也没有系统检查坐标是否为有限数字。

- 影响：能够写入该站点 origin 的脚本、浏览器扩展或用户自己构造的 localStorage 数据，可以让页面恢复大量对象或超长路径，造成卡顿、内存消耗或 PNG 导出失败。这不是当前站点上的远程攻击路径，也不导致代码执行；它是一个可被同源脚本放大的客户端 DoS 面。
- 修复：在 `restore()` 前做严格 schema 校验和上限控制，例如限制对象总数、标注长度、画笔命令长度，要求坐标为有限数字，并对 `kind`、`team` 使用 allowlist；超限时拒绝恢复并清理该版本缓存。对用户输入的标注也应设置合理长度上限。
- 缓解：保留现有 `textContent` 写入方式；不要因为需要导出 SVG 而改用 `innerHTML`。
- 误报说明：当前数据只来自本地浏览器，README 已明确说明不会自动上传；如果没有同源注入或恶意扩展，这个问题通常只能由用户自己触发。

## 已核实的安全正面项

- 标注文本在 `app.js:214-217` 使用 `t.textContent = text`，未使用 HTML 解析器。
- SVG 属性由固定元素名和内部生成的数据写入；没有发现 `innerHTML`、`outerHTML`、`insertAdjacentHTML`、`document.write`、`eval`、`new Function` 或字符串形式的事件处理器。
- 没有发现 `postMessage`、动态 `script` 注入或由用户输入控制的 `location` 跳转。
- 外部 GitHub 链接在 `index.html:73` 使用了 `target="_blank" rel="noreferrer noopener"`。
- `localStorage` 只保存战术图，不保存 token、密码、会话标识等敏感信息；这是本地状态风险，不是凭据泄露。
- `package.json` 没有运行时依赖；`npm test` 与 `npm run check` 均通过。

## 结论与优先级

1. 优先补充 Netlify 安全响应头：CSP、`frame-ancestors`，并按产品需要加入 `X-Content-Type-Options: nosniff`、`Referrer-Policy` 和 `Permissions-Policy`。
2. 在 `restore()` 中加入 schema、数量和长度限制。这是低风险但成本较低的健壮性改进。
3. 如果以后加入远程接口、登录、评论、多人协作或第三方统计，需要重新审查信任边界；当前“纯前端、无后端”这一假设是本次低风险结论的主要前提。

本报告不是渗透测试，也没有检查 Netlify 账户权限、DNS、GitHub Actions、域名接管风险或浏览器扩展环境。
