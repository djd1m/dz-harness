#!/usr/bin/env node

'use strict';

const { main } = require('../src/cli.js');

const rc = main(process.argv.slice(2));
if (rc !== null) process.exitCode = rc;
