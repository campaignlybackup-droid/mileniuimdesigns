import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const ARTIFACT_DIR = "/Users/anshbhatt/.gemini/antigravity-ide/brain/d1c2e081-37d4-4351-87f9-1f9d6cbeae93";

async function runAudit() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const results = {
    technical: {},
    desktop: {},
    mobile: {},
    brandIntegrity: {},
    consoleMessages: [],
    failedRequests: [],
  };

  console.log("=== STARTING DEEP UI/UX & TECHNICAL AUDIT ===");

  // 1. DESKTOP AUDIT (1280x900)
  console.log("\n--- AUDITING DESKTOP VIEWPORT (1280x900) ---");
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const desktopPage = await desktopContext.newPage();

  desktopPage.on("console", (msg) => {
    results.consoleMessages.push({ type: msg.type(), text: msg.text() });
  });

  desktopPage.on("requestfailed", (req) => {
    results.failedRequests.push({ url: req.url(), failure: req.failure()?.errorText });
  });

  await desktopPage.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 30000 });
  await desktopPage.waitForTimeout(1500);

  // Meta & SEO
  const title = await desktopPage.title();
  const metaDesc = await desktopPage.getAttribute('meta[name="description"]', 'content');
  results.technical.title = title;
  results.technical.metaDesc = metaDesc;

  // Desktop Horizontal Overflow Check
  const desktopOverflow = await desktopPage.evaluate(() => {
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: window.innerWidth,
      hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  results.desktop.overflow = desktopOverflow;

  // Desktop Video Banner Check
  const desktopVideo = await desktopPage.evaluate(() => {
    const video = document.querySelector('section video') || document.querySelector('video');
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    return {
      src: video.currentSrc || video.src,
      paused: video.paused,
      currentTime: video.currentTime,
      muted: video.muted,
      loop: video.loop,
      autoplay: video.autoplay,
      width: rect.width,
      height: rect.height,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      aspectRatio: (rect.width / rect.height).toFixed(2),
    };
  });
  results.desktop.video = desktopVideo;

  // Capture Desktop Hero Screenshot
  await desktopPage.screenshot({
    path: path.join(ARTIFACT_DIR, "audit_desktop_hero.png"),
    clip: { x: 0, y: 0, width: 1280, height: 850 },
  });

  // Desktop Header Check
  const desktopHeader = await desktopPage.evaluate(() => {
    const logo = document.querySelector('header img[alt*="MILLENNIUM"]');
    const navLinks = Array.from(document.querySelectorAll('header nav a')).map(a => a.textContent?.trim());
    const currencyBtn = Array.from(document.querySelectorAll('header button')).find(b => /USD|INR|EUR|GBP/i.test(b.textContent || "") || /currency/i.test(b.getAttribute("aria-label") || ""));
    const currency = currencyBtn?.textContent?.trim();
    return {
      hasLogo: !!logo,
      logoAlt: logo?.getAttribute('alt'),
      navLinks,
      currency,
    };
  });
  results.desktop.header = desktopHeader;

  // Check Exhibition Section on Desktop
  const exhibitionInfo = await desktopPage.evaluate(() => {
    const section = document.querySelector('#exhibitions') || 
                    document.querySelector('section[aria-label*="Exhibition" i]');
    if (!section) return null;

    // Check for unwanted buttons or text pills
    const buttons = Array.from(section.querySelectorAll('button')).map(b => b.textContent?.trim());
    const allText = section.innerText;
    const images = Array.from(section.querySelectorAll('img')).map(img => ({
      src: img.src,
      alt: img.alt,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      loaded: img.complete && img.naturalWidth > 0,
    }));

    // Check for pills/badges
    const pills = Array.from(section.querySelectorAll('[class*="pill"], [class*="badge"], [class*="tag"]')).map(el => el.textContent?.trim());

    return {
      found: true,
      buttonTexts: buttons,
      imageCount: images.length,
      allImagesLoaded: images.every(i => i.loaded),
      pills,
      hasPauseResume: buttons.some(b => /pause|resume/i.test(b)),
      hasLiveBadge: /live showcase/i.test(allText),
      images: images.slice(0, 5),
    };
  });
  results.desktop.exhibition = exhibitionInfo;

  // Scroll to Exhibition section
  const exhibitionElem = await desktopPage.$('#exhibitions');
  if (exhibitionElem) {
    await exhibitionElem.scrollIntoViewIfNeeded();
    await desktopPage.waitForTimeout(800);
    await desktopPage.screenshot({
      path: path.join(ARTIFACT_DIR, "audit_desktop_exhibitions.png"),
    });

    // Test Lightbox on Desktop
    await desktopPage.evaluate(() => {
      const card = document.querySelector('.md-exhibition-card');
      if (card && typeof card.click === 'function') card.click();
    });
    await desktopPage.waitForTimeout(600);

      // Verify modal
      const modalInfo = await desktopPage.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        if (!modal) return { open: false };
        const modalImg = modal.querySelector('img');
        const closeBtn = modal.querySelector('button[aria-label*="close" i]') || 
                         Array.from(modal.querySelectorAll('button')).find(b => /[✕×x]/i.test(b.textContent || ""));
        return {
          open: true,
          hasImage: !!modalImg,
          imgSrc: modalImg?.src,
          hasCloseButton: !!closeBtn,
        };
      });
      results.desktop.lightbox = modalInfo;

      await desktopPage.screenshot({
        path: path.join(ARTIFACT_DIR, "audit_desktop_lightbox.png"),
      });

      // Close modal
      await desktopPage.keyboard.press("Escape");
      await desktopPage.waitForTimeout(400);
  }

  // Desktop Footer Check
  await desktopPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await desktopPage.waitForTimeout(600);
  await desktopPage.screenshot({
    path: path.join(ARTIFACT_DIR, "audit_desktop_footer.png"),
  });

  const desktopFooter = await desktopPage.evaluate(() => {
    const footer = document.querySelector('footer');
    return {
      text: footer?.innerText?.slice(0, 300),
      hasMillenniumCopyright: /millennium designs/i.test(footer?.innerText || ""),
      hasAastha: /aastha/i.test(footer?.innerText || ""),
    };
  });
  results.desktop.footer = desktopFooter;

  await desktopContext.close();

  // 2. MOBILE AUDIT (390x844 - iPhone 14/15/16)
  console.log("\n--- AUDITING MOBILE VIEWPORT (390x844) ---");
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const mobilePage = await mobileContext.newPage();

  await mobilePage.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 30000 });
  await mobilePage.waitForTimeout(1500);

  // Mobile Horizontal Overflow Check
  const mobileOverflow = await mobilePage.evaluate(() => {
    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;
    const overflowingElements = [];
    document.querySelectorAll('*').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > winWidth + 1) {
        overflowingElements.push({
          tag: el.tagName,
          id: el.id,
          className: typeof el.className === 'string' ? el.className.slice(0, 50) : '',
          right: rect.right,
          width: rect.width,
        });
      }
    });

    return {
      scrollWidth: docWidth,
      clientWidth: winWidth,
      hasOverflow: docWidth > winWidth,
      overflowingCount: overflowingElements.length,
      sampleOverflow: overflowingElements.slice(0, 5),
    };
  });
  results.mobile.overflow = mobileOverflow;

  // Mobile Video Banner Check
  const mobileVideo = await mobilePage.evaluate(() => {
    const video = document.querySelector('section video') || document.querySelector('video');
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    return {
      src: video.currentSrc || video.src,
      paused: video.paused,
      currentTime: video.currentTime,
      muted: video.muted,
      width: rect.width,
      height: rect.height,
      aspectRatio: (rect.width / rect.height).toFixed(2),
      isSquare: Math.abs(rect.width - rect.height) < 4,
    };
  });
  results.mobile.video = mobileVideo;

  await mobilePage.screenshot({
    path: path.join(ARTIFACT_DIR, "audit_mobile_hero.png"),
    clip: { x: 0, y: 0, width: 390, height: 750 },
  });

  // Mobile Hamburger Menu Check
  const hamburgerInfo = await mobilePage.evaluate(() => {
    const btn = document.querySelector('button[aria-label*="menu" i], button[aria-label*="navigation" i], header button:has(svg)');
    if (!btn) return { found: false };
    const rect = btn.getBoundingClientRect();
    return {
      found: true,
      ariaLabel: btn.getAttribute('aria-label'),
      width: rect.width,
      height: rect.height,
      touchTargetAdequate: rect.width >= 40 && rect.height >= 40,
    };
  });
  results.mobile.hamburger = hamburgerInfo;

  // Open Hamburger Menu
  const menuBtn = await mobilePage.$('button[aria-label*="menu" i], button[aria-label*="navigation" i]');
  if (menuBtn) {
    await menuBtn.click();
    await mobilePage.waitForTimeout(500);

    const drawerInfo = await mobilePage.evaluate(() => {
      const drawer = document.querySelector('[role="dialog"], [aria-label*="menu" i], aside');
      const links = Array.from(document.querySelectorAll('nav a, aside a')).map(a => a.textContent?.trim());
      return {
        isOpen: true,
        linksCount: links.length,
        links: links.slice(0, 8),
      };
    });
    results.mobile.drawer = drawerInfo;

    await mobilePage.screenshot({
      path: path.join(ARTIFACT_DIR, "audit_mobile_drawer.png"),
    });

    // Close drawer
    await mobilePage.keyboard.press("Escape");
    await mobilePage.waitForTimeout(400);
  }

  // Mobile Product Grid
  await mobilePage.evaluate(() => window.scrollBy(0, 700));
  await mobilePage.waitForTimeout(600);
  await mobilePage.screenshot({
    path: path.join(ARTIFACT_DIR, "audit_mobile_products.png"),
  });

  // Mobile Exhibition Showcase
  const mobileExhibitionElem = await mobilePage.$('#exhibitions');
  if (mobileExhibitionElem) {
    await mobileExhibitionElem.scrollIntoViewIfNeeded();
    await mobilePage.waitForTimeout(600);
    await mobilePage.screenshot({
      path: path.join(ARTIFACT_DIR, "audit_mobile_exhibitions.png"),
    });

    // Mobile Lightbox Test
    await mobilePage.evaluate(() => {
      const card = document.querySelector('.md-exhibition-card');
      if (card && typeof card.click === 'function') card.click();
    });
    await mobilePage.waitForTimeout(500);

      const mobileModalInfo = await mobilePage.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        if (!modal) return { open: false };
        const modalImg = modal.querySelector('img');
        const rect = modalImg?.getBoundingClientRect();
        return {
          open: true,
          imgWidth: rect?.width,
          imgHeight: rect?.height,
          withinViewport: (rect?.width || 0) <= window.innerWidth,
        };
      });
      results.mobile.lightbox = mobileModalInfo;

      await mobilePage.screenshot({
        path: path.join(ARTIFACT_DIR, "audit_mobile_lightbox.png"),
      });

      await mobilePage.keyboard.press("Escape");
      await mobilePage.waitForTimeout(400);
  }

  // Mobile Footer
  await mobilePage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await mobilePage.waitForTimeout(600);
  await mobilePage.screenshot({
    path: path.join(ARTIFACT_DIR, "audit_mobile_footer.png"),
  });

  // 3. BRAND INTEGRITY CHECK
  const brandCheck = await mobilePage.evaluate(() => {
    const fullHtml = document.documentElement.innerHTML;
    const bodyText = document.body.innerText;
    
    const aasthaMatches = Array.from(bodyText.matchAll(/aastha/gi)).map(m => m[0]);
    const millenniumMatches = Array.from(bodyText.matchAll(/millennium/gi)).map(m => m[0]);

    return {
      bodyAasthaCount: aasthaMatches.length,
      bodyMillenniumCount: millenniumMatches.length,
      htmlAasthaOccurrences: (fullHtml.match(/aastha/gi) || []).length,
    };
  });
  results.brandIntegrity = brandCheck;

  await mobileContext.close();
  await browser.close();

  console.log("\n=== AUDIT RESULTS SUMMARY ===");
  console.log(JSON.stringify(results, null, 2));

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, "audit_results.json"),
    JSON.stringify(results, null, 2),
    "utf-8"
  );

  return results;
}

runAudit().catch(err => {
  console.error("Audit failed with error:", err);
  process.exit(1);
});
