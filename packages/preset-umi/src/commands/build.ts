import { getMarkup } from '@umijs/server';
import { importLazy, logger } from '@umijs/utils';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { IApi } from '../types';
import { clearTmp } from '../utils/clearTmp';
import { getBabelOpts } from './dev/getBabelOpts';
import { getMarkupArgs } from './dev/getMarkupArgs';

const bundlerWebpack: typeof import('@umijs/bundler-webpack') = importLazy(
  '@umijs/bundler-webpack',
);
const bundlerVite: typeof import('@umijs/bundler-vite') = importLazy(
  '@umijs/bundler-vite',
);

export default (api: IApi) => {
  api.registerCommand({
    name: 'build',
    description: 'build app for production',
    details: `
umi build

# build without compression
COMPRESS=none umi build

# clean and build
umi build --clean
`,
    fn: async function () {
      // clear tmp except cache
      clearTmp(api.paths.absTmpPath);

      // generate files
      async function generate(opts: { isFirstTime?: boolean; files?: any }) {
        api.applyPlugins({
          key: 'onGenerateFiles',
          args: {
            files: opts.files || null,
            isFirstTime: opts.isFirstTime,
          },
        });
      }
      await generate({
        isFirstTime: true,
      });

      // build
      // TODO: support watch mode
      const {
        babelPreset,
        beforeBabelPlugins,
        beforeBabelPresets,
        extraBabelPlugins,
        extraBabelPresets,
        chainWebpack,
      } = await getBabelOpts({ api });
      const opts = {
        config: api.config,
        cwd: api.cwd,
        entry: {
          umi: join(api.paths.absTmpPath, 'umi.ts'),
        },
        ...(api.args.vite ? {} : { babelPreset, chainWebpack }),
        beforeBabelPlugins,
        beforeBabelPresets,
        extraBabelPlugins,
        extraBabelPresets,
        onBuildComplete(opts: any) {
          api.applyPlugins({
            key: 'onBuildComplete',
            args: opts,
          });
        },
        clean: api.args.clean,
      };
      if (api.args.vite) {
        await bundlerVite.build(opts);
      } else {
        await bundlerWebpack.build(opts);
      }

      // generate html
      const { vite } = api.args;
      const markupArgs = await getMarkupArgs({ api });
      // @ts-ignore
      const markup = await getMarkup({
        ...markupArgs,
        scripts: ['/umi.js'].concat(markupArgs.scripts),
        esmScript: vite,
        path: '/',
      });
      writeFileSync(
        join(api.paths.absOutputPath, 'index.html'),
        markup,
        'utf-8',
      );
      logger.event('build index.html');

      // print size
    },
  });
};