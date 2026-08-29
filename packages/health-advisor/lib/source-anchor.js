'use strict';

// source-anchor.js — the `lib/` DOOR to the one `source_anchor` value object.
//
// THIS FILE HOLDS NO IMPLEMENTATION, AND THAT IS THE POINT (NFR-5, SP-7). The implementation lives at
// skills/case-state/engine/source-anchor.js because `lib/installer.js` installs `skills/case-state/`
// as a standalone directory and does NOT copy `lib/` with it — a `require('../../../lib/…')` from
// `engine/schema.js` resolves to nothing for exactly the users who installed the skill, and
// test/case-state-packaging.test.js RUNS the installed `engine/cli.js`.
//
// Re-exporting rather than re-implementing means `require('lib/source-anchor.js').validateAnchor` and
// `require('skills/case-state/engine/source-anchor.js').validateAnchor` are the SAME FUNCTION OBJECT
// (Node's require cache), which is what SP-7 asserts. A second copy would be a second validator, and
// the sixth bug would be fixed in only one of them.

module.exports = require('../skills/case-state/engine/source-anchor.js');
