const esbuild = require('esbuild');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const srcDir = path.join(projectRoot, 'src');
const legalLinks = {
  LEGAL_NOTICE_URL:
    process.env.LEGAL_NOTICE_URL || 'https://example.com/legal-notice',
  PRIVACY_POLICY_URL:
    process.env.PRIVACY_POLICY_URL || 'https://example.com/privacy-policy',
  LICENSE_URL:
    process.env.LICENSE_URL || 'https://github.com/google/llm-sidebar-with-context/blob/main/LICENSE',
};

async function build() {
  // 1. Resolve optional environment variables
  const missingVars = Object.entries(legalLinks)
    .filter(([key]) => !process.env[key])
    .map(([key]) => key);

  if (missingVars.length > 0) {
    console.warn(
      `Using fallback legal links for: ${missingVars.join(', ')}`,
    );
  }

  // 2. Clean dist directory
  await fs.emptyDir(distDir);

  // 3. Copy static assets (excluding pages which we'll process)
  const filesToCopy = [
    {
      src: path.join(projectRoot, 'manifest.json'),
      dest: path.join(distDir, 'manifest.json'),
    },
    {
      src: path.join(projectRoot, 'icon16.png'),
      dest: path.join(distDir, 'icon16.png'),
    },
    {
      src: path.join(projectRoot, 'icon48.png'),
      dest: path.join(distDir, 'icon48.png'),
    },
    {
      src: path.join(projectRoot, 'icon128.png'),
      dest: path.join(distDir, 'icon128.png'),
    },
    {
      src: path.join(srcDir, 'styles'),
      dest: path.join(distDir, 'src/styles'),
    },
  ];

  for (const file of filesToCopy) {
    await fs.copy(file.src, file.dest);
  }

  // 4. Process HTML pages with placeholders
  await fs.ensureDir(path.join(distDir, 'src/pages'));

  const htmlPages = [
    'sidebar.html',
    'welcome.html',
    'website.html',
    'native-companion-test.html',
  ];
  for (const page of htmlPages) {
    const htmlPath = path.join(srcDir, 'pages', page);
    let html = await fs.readFile(htmlPath, 'utf-8');

    html = html
      .replace(/{{LEGAL_NOTICE_URL}}/g, legalLinks.LEGAL_NOTICE_URL)
      .replace(/{{PRIVACY_POLICY_URL}}/g, legalLinks.PRIVACY_POLICY_URL)
      .replace(/{{LICENSE_URL}}/g, legalLinks.LICENSE_URL);

    await fs.writeFile(path.join(distDir, 'src/pages', page), html, 'utf-8');
  }

  // 5. Bundle scripts
  const esmEntryPoints = [
    path.join(srcDir, 'scripts/background.ts'),
    path.join(srcDir, 'scripts/sidebar.ts'),
  ];

  const iifeEntryPoints = [
    path.join(srcDir, 'scripts/webExtraction.ts'),
    path.join(srcDir, 'scripts/agentdropContent.ts'),
  ];

  // ESM Build (Background, Sidebar)
  await esbuild.build({
    entryPoints: esmEntryPoints,
    bundle: true,
    outdir: path.join(distDir, 'src/scripts'),
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    sourcemap: true,
    define: {
      'process.env.LEGAL_NOTICE_URL': JSON.stringify(legalLinks.LEGAL_NOTICE_URL),
      'process.env.PRIVACY_POLICY_URL': JSON.stringify(
        legalLinks.PRIVACY_POLICY_URL,
      ),
      'process.env.LICENSE_URL': JSON.stringify(legalLinks.LICENSE_URL),
    },
  });

  // IIFE Build (Web Extraction)
  await esbuild.build({
    entryPoints: iifeEntryPoints,
    bundle: true,
    outdir: path.join(distDir, 'src/scripts'),
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    sourcemap: true,
  });

  console.log('Build complete! Output in dist/');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
