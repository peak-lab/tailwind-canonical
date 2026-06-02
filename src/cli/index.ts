#!/usr/bin/env node
import { run } from './cli.js';

const { exitCode, watching } = await run(process.argv.slice(2), process.cwd());
if (!watching) process.exit(exitCode);
