// The entry the grader runs (Node 22, standard library only): hand in the game.
//
// The game is this directory's game/ folder — plain static files the browser loads as
// ES modules, with three.js coming from the import map's single "three" entry. This
// program copies game/ and screenshots/ beside it into /output and writes
// /output/dossier.json, the summary the judge reads, using the kit's vendored library.
// Nothing here touches the network, the clock or randomness, so two runs write the
// same bytes.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });

// game/: the whole app, byte for byte
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });

// screenshots/: the captures of the running game, the first by name the cover
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// dossier.json: the Load block and the source outline the judge reads. The caps are
// the scorer's own, so an entry the scorer would refuse is refused here instead.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
