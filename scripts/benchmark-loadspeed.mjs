import { chromium } from "playwright";

async function measurePageSpeed(url, isMobile = false) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });

  const contextOptions = isMobile
    ? {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      }
    : {
        viewport: { width: 1280, height: 900 },
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      };

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  // Inject Web Vitals observer before navigation
  await page.addInitScript(() => {
    window.__perfMetrics = {
      fcp: 0,
      lcp: 0,
      cls: 0,
      videoPlayingTime: 0,
      posterPaintedTime: 0,
    };

    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          window.__perfMetrics.fcp = entry.startTime;
        }
      }
    }).observe({ type: "paint", buffered: true });

    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        window.__perfMetrics.lcp = entry.startTime;
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });

    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__perfMetrics.cls += entry.value;
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

  const startNav = Date.now();
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  const navDuration = Date.now() - startNav;

  // Wait for video playback check
  await page.waitForTimeout(2000);

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const video = document.querySelector("video");
    const posterImg = document.querySelector('img[src*="banner-poster"]');

    return {
      navDuration: window.__perfMetrics,
      ttfb: nav ? Math.round(nav.responseStart - nav.fetchStart) : 0,
      domInteractive: nav ? Math.round(nav.domInteractive - nav.fetchStart) : 0,
      domComplete: nav ? Math.round(nav.domComplete - nav.fetchStart) : 0,
      loadEvent: nav ? Math.round(nav.loadEventEnd - nav.fetchStart) : 0,
      fcp: Math.round(window.__perfMetrics.fcp),
      lcp: Math.round(window.__perfMetrics.lcp),
      cls: Number(window.__perfMetrics.cls.toFixed(4)),
      video: video
        ? {
            src: video.currentSrc || video.src,
            paused: video.paused,
            currentTime: Number(video.currentTime.toFixed(2)),
            readyState: video.readyState,
          }
        : null,
      posterLoaded: posterImg ? posterImg.complete && posterImg.naturalWidth > 0 : false,
    };
  });

  await context.close();
  await browser.close();

  return metrics;
}

async function runBenchmarks() {
  console.log("=== RUNNING PAGE LOADSPEED & PLAYBACK BENCHMARK ===");

  console.log("\n[1] Measuring Desktop Viewport (1280x900)...");
  const desktopMetrics = await measurePageSpeed("http://localhost:3000", false);
  console.log("Desktop Results:", JSON.stringify(desktopMetrics, null, 2));

  console.log("\n[2] Measuring Mobile Viewport (390x844)...");
  const mobileMetrics = await measurePageSpeed("http://localhost:3000", true);
  console.log("Mobile Results:", JSON.stringify(mobileMetrics, null, 2));

  console.log("\n=== BENCHMARK SUMMARY ===");
  console.log(`Desktop TTFB: ${desktopMetrics.ttfb}ms | FCP: ${desktopMetrics.fcp}ms | LCP: ${desktopMetrics.lcp}ms | CLS: ${desktopMetrics.cls}`);
  console.log(`Desktop Video: Playing=${!desktopMetrics.video?.paused} (time=${desktopMetrics.video?.currentTime}s, readyState=${desktopMetrics.video?.readyState})`);
  console.log(`Mobile  TTFB: ${mobileMetrics.ttfb}ms | FCP: ${mobileMetrics.fcp}ms | LCP: ${mobileMetrics.lcp}ms | CLS: ${mobileMetrics.cls}`);
  console.log(`Mobile  Video: Playing=${!mobileMetrics.video?.paused} (time=${mobileMetrics.video?.currentTime}s, readyState=${mobileMetrics.video?.readyState})`);
}

runBenchmarks().catch(console.error);
