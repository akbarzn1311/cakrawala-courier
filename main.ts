// Cakrawala Courier — program penyerahan (Node 22, standard library only).
// Tugasnya satu: menyalin game/ dan screenshots/ dari repositori ini ke
// /output, lalu menulis /output/dossier.json, ringkasan yang dibaca juri,
// dengan library make.fun yang sudah di-vendor. Tidak ada jaringan, tidak
// ada waktu, tidak ada acak di sini: dua kali jalan harus menghasilkan
// byte yang sama persis, jadi program ini hanya menyalin dan merangkum.
//
// Di luar grader, MAKEFUN_OUTPUT_DIR menggantikan /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Direktori repositori ini (tempat main.ts berada) dan direktori keluaran.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Batas-batas yang dipakai scorer (lihat RULES.txt): dossier memuat teks
// sumber sampai 160 KiB, paling banyak 4 screenshot @ 256 KiB, dan game/
// paling banyak 993 entri / 48 MiB dengan path di bawah 1000 byte.
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, DOSSIER_LIMITS));
