const esbuild = require('esbuild');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const srcDir = path.join(projectRoot, 'src');

async function build() {
  // 1. Validate environment variables
  const requiredEnvVars = [
    'LEGAL_NOTICE_URL',
    'PRIVACY_POLICY_URL',
    'LICENSE_URL',
  ];
  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

  if (missingVars.length > 0) {
    console.error(
      `Error: Missing required environment variables: ${missingVars.join(', ')}`,
    );
    console.error('Please create a .env file based on .env.example');
    process.exit(1);
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

  // 4. Process sidebar.html with placeholders
  const sidebarHtmlPath = path.join(srcDir, 'pages/sidebar.html');
  let sidebarHtml = await fs.readFile(sidebarHtmlPath, 'utf-8');

  sidebarHtml = sidebarHtml
    .replace(/{{LEGAL_NOTICE_URL}}/g, process.env.LEGAL_NOTICE_URL)
    .replace(/{{PRIVACY_POLICY_URL}}/g, process.env.PRIVACY_POLICY_URL)
    .replace(/{{LICENSE_URL}}/g, process.env.LICENSE_URL);

  await fs.ensureDir(path.join(distDir, 'src/pages'));
  await fs.writeFile(
    path.join(distDir, 'src/pages/sidebar.html'),
    sidebarHtml,
    'utf-8',
  );

  // 5. Bundle scripts
  const entryPoints = [
    path.join(srcDir, 'scripts/background.ts'),
    path.join(srcDir, 'scripts/sidebar.ts'),
  ];

  await esbuild.build({
    entryPoints: entryPoints,
    bundle: true,
    outdir: path.join(distDir, 'src/scripts'),
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    sourcemap: true,
    define: {
      'process.env.LEGAL_NOTICE_URL': JSON.stringify(
        process.env.LEGAL_NOTICE_URL,
      ),
      'process.env.PRIVACY_POLICY_URL': JSON.stringify(
        process.env.PRIVACY_POLICY_URL,
      ),
      'process.env.LICENSE_URL': JSON.stringify(process.env.LICENSE_URL),
    },
  });

  console.log('Build complete! Output in dist/');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
