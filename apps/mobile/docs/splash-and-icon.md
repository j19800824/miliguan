# App 图标与启动图维护说明

## 桌面图标和原生启动画面

这些资源会被打进安装包，替换后必须重新构建 APK：

- `apps/mobile/assets/icon.png`：桌面图标，建议 `1024x1024`，不要透明底。
- `apps/mobile/assets/adaptive-icon.png`：Android 自适应图标前景，建议 `1024x1024`，主体放在安全区。
- `apps/mobile/assets/splash-icon.png`：Expo 原生启动画面居中图。
- `apps/mobile/assets/splash.png`：App 内默认品牌启动页。

替换后运行：

```bash
pnpm --filter mobile typecheck
pnpm --filter mobile exec expo config --type public --json
pnpm dlx eas-cli build -p android --profile production
```

## 动态启动图

动态启动图不替代系统原生 splash。它是在 App 初始化完成后展示的一层品牌启动页，可以不重新打包就更换。

后台接口：

```text
GET /api/mobile/app-splash
```

后台系统设置项：

- `mobile.splash.enabled`：是否启用，默认 `true`。
- `mobile.splash.image_url`：远程图片 URL，留空时使用服务器默认图 `/mobile-splash-default.png`。
- `mobile.splash.version`：启动图版本号。更换图片后必须修改这个值，App 才会重新下载。
- `mobile.splash.duration_ms`：展示时长，单位毫秒，默认 `1200`。

App 行为：

- 启动时先读取上一次下载成功的本地图片。
- 后台请求 `/api/mobile/app-splash`。
- 如果版本或 URL 对应的新图可下载，就缓存到本地。
- 下一次启动优先使用这个本地缓存图。

推荐图片：

- 比例：手机竖屏 `9:16`。
- 尺寸：`1242x2436` 或同等比例高清图。
- 格式：PNG/JPG/WebP 均可，推荐 HTTPS 地址。
