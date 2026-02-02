const esbuild = require('esbuild');
const fs = require('fs-extra');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const srcDir = path.join(projectRoot, 'src');

async function build() {
  // 1. Clean dist directory
  await fs.emptyDir(distDir);

  // 2. Copy static assets
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
      src: path.join(srcDir, 'pages'),
      dest: path.join(distDir, 'src/pages'),
    },
    {
      src: path.join(srcDir, 'styles'),
      dest: path.join(distDir, 'src/styles'),
    },
  ];

  for (const file of filesToCopy) {
    await fs.copy(file.src, file.dest);
  }

  // 3. Bundle scripts
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
  });

  console.log('Build complete! Output in dist/');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
