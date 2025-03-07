import {build, context} from 'esbuild';
import progress from '@olton/esbuild-plugin-progress';
import {replace} from "esbuild-plugin-replace";
import pkg from "./package.json" with {type: "json"};

const production = process.env.MODE === 'production';

const version = pkg.version

const banner = `
/*!
 * Router v${version} (Router ror SPA)
 * Build: ${new Date().toLocaleString()}
 * Copyright ${new Date().getFullYear()} by Serhii Pimenov
 * Licensed under MIT
 */
`

const drop = []

if (!production) {
    //drop.push("console")
}

const options = {
    entryPoints: ['./src/index.js'],
    outfile: './dist/router.js',
    bundle: true,
    minify: production,
    sourcemap: false,
    banner: {
        js: banner
    },
    plugins: [
        progress({
            text: 'Building Router...',
            succeedText: `Router built successfully in %s ms!`
        }),
        replace({
            '__BUILD_TIME__': new Date().toLocaleString(),
            '__VERSION__': version,
        })
    ],
    drop,
}

if (production) {
    await build({
        ...options,
        format: 'esm',
    })
} else {
    const ctxEsm = await context({
        ...options,
        format: 'esm',
    })
    await Promise.all([
        ctxEsm.watch(), 
    ])
}

