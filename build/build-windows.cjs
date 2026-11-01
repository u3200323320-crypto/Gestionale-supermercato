const { execSync } = require('node:child_process');
const path = require('node:path');
const { build, Platform } = require('electron-builder');
const packageJson = require('../package.json');
const projectDirectory = path.resolve(__dirname, '..');
const variant = process.argv[2] ?? 'all';
const variants = variant === 'all' ? ['management', 'pos'] : [variant];

if (variants.some((item) => !['management', 'pos'].includes(item))) {
  throw new Error('La variante deve essere management, pos oppure all.');
}

async function buildVariant(name) {
  const isPos = name === 'pos';
  const productName = isPos ? 'Cassa Supermercato' : packageJson.build.productName;
  const env = { ...process.env, APP_VARIANT: name };

  execSync('npm run build', { cwd: projectDirectory, env, stdio: 'inherit' });

  await build({
    targets: Platform.WINDOWS.createTarget('nsis'),
    projectDir: projectDirectory,
    publish: 'never',
    config: {
      ...packageJson.build,
      appId: isPos ? 'it.gestionale.supermercato.pos' : packageJson.build.appId,
      productName,
      directories: { ...packageJson.build.directories, output: `release/${name}` },
      win: {
        ...packageJson.build.win,
        artifactName: (isPos ? 'Cassa' : 'Gestione') + '-Supermercato-Setup-${version}.${ext}',
      },
    },
  });
}

(async () => {
  for (const name of variants) await buildVariant(name);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
