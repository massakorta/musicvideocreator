import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';

const here = path.dirname(fileURLToPath(import.meta.url));
const entryPoint = path.resolve(here, '../src/entry.ts');
const outDir = path.resolve(here, '../dist/bundle');

const serveUrl = await bundle({
  entryPoint,
  outDir,
  webpackOverride: (webpackConfig) => {
    webpackConfig.resolve = webpackConfig.resolve ?? {};
    webpackConfig.resolve.extensionAlias = {
      ...webpackConfig.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return webpackConfig;
  },
});

console.log(`Remotion bundle ready at ${serveUrl}`);
