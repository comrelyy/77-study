// Rebuild the small, shared pencil-and-watercolor illustrations.
const fs=require('fs'),path=require('path');
const art={
ball:`<circle cx="60" cy="61" r="43" fill="#dfb774"/><path fill="#9cad95" d="M28 31q35 14 63 1l10 22q-32 26-80 6z"/><path d="M38 22q-17 45 7 78m29-78q20 40 1 77" stroke="#f9e5b9" stroke-width="5"/>`,
car:`<path fill="#9eb6ad" d="m19 59 15-28 41 2 18 27 13 5-2 24-90-1 1-23z"/><path fill="#fff5dc" d="m39 39-9 20 48 1-12-20z"/><path d="m53 40 1 20"/><circle cx="35" cy="87" r="13" fill="#766554"/><circle cx="86" cy="87" r="13" fill="#766554"/><circle cx="35" cy="87" r="5" fill="#e7d1ad"/><circle cx="86" cy="87" r="5" fill="#e7d1ad"/>`,
apple:`<path fill="#d98772" d="M58 48C30 25 15 59 29 83c13 25 25 15 31 15 10 7 25 4 34-18 14-32-9-47-28-32z"/><path d="m61 49 3-23"/><path fill="#9fae79" d="M65 35c3-19 24-19 26-13-4 14-18 19-26 13z"/><path d="M36 59q-7 12 1 22" stroke="#f5c6ac"/>`,
banana:`<path fill="#edcf77" d="M28 29c-9 34 25 65 61 41l10-9c-7 37-58 53-77 19-10-18-8-37 6-51z"/><path d="M28 38c-6 35 31 58 60 35" stroke="#be9e50"/><path d="m28 29-2-8m73 40 4-7"/>`,
bread:`<path fill="#cc9d69" d="M29 56C7 31 36 13 59 22c28-13 58 9 34 34l-1 44-64 1z"/><path fill="#f3d9a4" d="M37 58C19 40 37 25 59 34c22-10 42 8 25 24v33H37z"/><path d="m48 54 3 1m20-8 2 1m-8 24 2 1m-19 8 2 1" stroke="#c4a170"/>`,
milk:`<path fill="#fffcf1" d="m34 42 12-23 31 2 14 24-2 59-56-2z"/><path fill="#b3c9cf" d="m34 62 56 2-1 27-55-2z"/><path d="m34 42 57 3m-45-26 11 24 20-22m-20 22-1 60"/><path d="m66 73 15 1m-15 7 11 1" stroke="#fffaf0"/>`,
basket:`<path d="M33 53C24 1 94 0 88 52" stroke-width="5"/><path fill="#d9b477" d="m17 50 87-2-12 55-62 1z"/><path d="m25 65 70-1m-66 15 62-1m-57 15 53-1m-44-40 6 49m12-50 1 49m14-50-3 49" stroke="#aa8151" stroke-width="2"/><path d="m16 50 89-2" stroke-width="5"/>`,
momo:`<path fill="#cda179" d="M31 44C4 37 15 10 34 20l10 16m35 0C81 7 111 15 103 38l-12 9"/><path fill="#cfa47b" d="M25 45C7 82 30 105 62 104c39 0 54-25 34-60-13-21-55-24-71 1z"/><path fill="#f5dfbc" stroke="none" d="M39 72c-5-23 40-24 44-2 4 26-41 28-44 2z"/><path d="m34 56 1 2m51-3 1 2" stroke-width="5"/><path fill="#665442" d="m54 68 14-1-6 8z"/><path d="m62 75-1 7m-9-1q9 8 18-1"/><path d="m26 73 9 1m49-1 9-1" stroke="#d79781" stroke-width="5"/>`,
bunny:`<path fill="#fff8e9" d="M37 52C1 5 28-5 44 22l10 26C51 2 76-5 77 20l-7 31c35 13 36 48 1 56-37 10-63-22-43-45z"/><path d="m32 21 12 26m23-28-4 27" stroke="#e4bcaa" stroke-width="4"/><path d="m37 70 1 2m39-2 1 2" stroke-width="5"/><path fill="#d39483" stroke="#d39483" d="m52 81 11 1-5 5z"/><path d="m47 94 11 2 10-3"/><path d="m30 85 7 1m40 1 7-1" stroke="#e6b5a1" stroke-width="5"/>`,
wave:`<path fill="#e9c59c" d="M35 102 19 72c-6-13 4-21 12-9l9 11-9-42c-3-13 9-17 13-3l9 30-2-40c0-14 13-15 14 0l1 39 7-34c3-13 15-8 12 5l-5 34 10-20c6-12 17-4 11 7L88 96c-9 20-40 24-53 6z"/><path d="m9 30-5-9m11 28-11-1m95-28 8-8"/>`,
water:`<path fill="#b7d4dc" d="M60 14C49 36 24 61 28 82c5 32 59 34 65 1 4-21-21-49-33-69z"/><path d="M41 71q-6 16 8 20" stroke="#f7fcf4" stroke-width="5"/>`,
cloud:`<path fill="#fffaf0" d="M26 85C1 82 6 53 28 54c-2-35 44-43 54-12 30-6 43 28 20 40-19 8-54 8-76 3z"/>`
};
const dir=path.join(__dirname,'static','illustrations');fs.mkdirSync(dir,{recursive:true});
for(const [name,body] of Object.entries(art).filter(([name])=>! ['momo','bunny'].includes(name)))fs.writeFileSync(path.join(dir,name+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"><g stroke="#75604c" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`);

// Character assets and the picnic share one reproducible brush source.
require("node:child_process").execFileSync(process.execPath,[path.join(__dirname,"scripts/draw-characters.mjs")],{stdio:"inherit"});
require("node:child_process").execFileSync(process.execPath,[path.join(__dirname,"scripts/draw-character-sheet.mjs")],{stdio:"inherit"});
require('./draw-content-assets.cjs');
