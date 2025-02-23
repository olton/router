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
    console.log('Production build')
    await build({
        ...options,
        format: 'esm',
    })

    await build({
        ...options,
        entryPoints: ['./src/browser.js'],
        format: 'iife',
        outfile: './lib/router.js',
    })
} else {
    console.log('Development build')
    const ctxEsm = await context({
        ...options,
        format: 'esm',
    })

    const ctxLib = await context({
        ...options,
        entryPoints: ['./src/browser.js'],
        format: 'iife',
        outfile: './lib/router.js',
    })

    await Promise.all([
        ctxEsm.watch(), 
        ctxLib.watch()
    ])
}

