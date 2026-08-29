#!/usr/bin/env tsx
import { createClient } from '@libsql/client';
import { unlinkSync, existsSync, readFileSync } from 'node:fs';

const DB_FILE = 'vibebin.db';
for (const ext of ['', '-wal', '-shm']) {
  if (existsSync(DB_FILE + ext)) unlinkSync(DB_FILE + ext);
}

function ts(d: string): number { return new Date(d).getTime(); }

async function main() {
  console.log('🔨 Building SQLite database with your real data...\n');
  const client = createClient({ url: `file:${DB_FILE}` });

  // Create schema
  const stmts = [
    `PRAGMA foreign_keys = ON`,
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, username_changed_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS signup_ips (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, ip TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS signup_ips_ip_idx ON signup_ips (ip)`,
    `CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, display_name TEXT, bio TEXT NOT NULL DEFAULT '', bio_enabled INTEGER NOT NULL DEFAULT 1, avatar_url TEXT, banner_url TEXT, banner_type TEXT NOT NULL DEFAULT 'image', name_from TEXT NOT NULL DEFAULT '#a78bfa', name_to TEXT NOT NULL DEFAULT '#22d3ee', name_style TEXT NOT NULL DEFAULT 'gradient', name_effect TEXT NOT NULL DEFAULT 'none', effect_speed INTEGER NOT NULL DEFAULT 50, effect_intensity INTEGER NOT NULL DEFAULT 60, accent TEXT NOT NULL DEFAULT '#8b5cf6', links TEXT NOT NULL DEFAULT '[]', views INTEGER NOT NULL DEFAULT 0, status_emoji TEXT NOT NULL DEFAULT '', status_text TEXT NOT NULL DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS password_resets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, used_at INTEGER, created_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id)`,
    `CREATE TABLE IF NOT EXISTS pastes (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL DEFAULT 'Untitled', title_color TEXT, format TEXT NOT NULL DEFAULT 'plain', content TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'plaintext', visibility TEXT NOT NULL DEFAULT 'public', password_hash TEXT, expires_at INTEGER, pinned INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, likes_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS pastes_user_idx ON pastes (user_id)`,
    `CREATE INDEX IF NOT EXISTS pastes_created_idx ON pastes (created_at)`,
    `CREATE TABLE IF NOT EXISTS likes (id TEXT PRIMARY KEY, paste_id TEXT NOT NULL REFERENCES pastes(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, ip_hash TEXT, created_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS likes_paste_idx ON likes (paste_id)`,
    `CREATE INDEX IF NOT EXISTS likes_user_idx ON likes (user_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS likes_paste_user_idx ON likes (paste_id, user_id) WHERE user_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS likes_paste_ip_idx ON likes (paste_id, ip_hash) WHERE ip_hash IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, label TEXT NOT NULL UNIQUE, color TEXT NOT NULL DEFAULT '#a78bfa', effect TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS user_tags (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY (user_id, tag_id))`,
    `CREATE TABLE IF NOT EXISTS stickers (id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, url TEXT, emoji TEXT, label TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`,
  ];
  for (const s of stmts) await client.execute(s);
  console.log('✅ Schema created');

  const tx = await client.transaction('write');

  // USERS
  const users = [
    ['2da9ff77-bcfe-4ad6-86f3-47e9ffe0817b','demo','$2b$10$y2X/0x3g9LKsMNbQU1I6fu7fTu1jWxSeBH1OXoTAYjUjww9Qi3Xxm','2026-08-28T15:12:50.91779+00:00'],
    ['763f8a37-94a3-465d-b37b-c24fa38794c8','nova','$2b$10$nTefev9wMwI1qZyEzykFGekWTcUIIo04qRngA6vY5wkVeKOnNaCSq','2026-08-28T15:12:51.362674+00:00'],
    ['9c6fe730-f938-4abc-b183-770ba43d9550','Yori','$2b$10$I.voBuqzdZX8YqptubP41OsBxP3VmpcotjzDYeCqvhy7L3VlOsAkC','2026-08-28T15:15:29.420573+00:00'],
    ['5e549a95-2e46-4ba2-9adc-22e5586067cf','Cool_name123','$2b$10$tP7Kgo.WoxdC1fb5ixldRen5p3mL3ltPhTLdQDLmWT23rfcHVfNaq','2026-08-28T17:22:10.0951+00:00'],
    ['096cbb8d-7afb-4b0f-bf88-1dc4a94d25d2','cosmofic','$2b$10$HvaTeEQtB36M/CXz6eg9u.sSjOGK36gVUHuz0jKYbhB2w4h0yilAO','2026-08-28T17:25:49.337979+00:00'],
    ['11a8214d-81e3-4754-814a-26d10efbe444','FEARFLESH','$2b$10$WW/5jAg6YfASs/sO.gIX9ua7sFIz1pIBtBUqFfM1QVL7m21nZ4giG','2026-08-28T17:42:04.620972+00:00'],
    ['8382c93d-2585-49fe-a7d8-a8ecad5077a5','indiapooper','$2b$10$dKr6./8Lxx9OkPkLdPViie5wa4U85l4l4Amp79KB8OmDRUcfgVbpW','2026-08-28T17:52:59.5948+00:00'],
    ['25ef630c-c41a-44ec-94b1-a314bf2bb1e8','mahmoon','$2b$10$.kxDawA3xyWkTJ07kowSE.T6R6z3JkVDFZMRMa3xuk2EZbEHjgNj6','2026-08-28T17:54:13.112978+00:00'],
    ['45e7030d-1dd2-4aec-b70a-627443851ddc','Bulletyhaj','$2b$10$M9ouh0GWIbcC0Ia0BpLhuuAgnwxaL4hwZWmpNRSYzVxWSD.vRuaDy','2026-08-28T18:12:41.452587+00:00'],
    ['5cde6097-0ef9-42ab-b672-6713e0baa9ec','fffdddddddddd','$2b$10$76zVvCR2Ip4R9UpTupMRFeVGsVgjO1.xx03FrX22C.BMHDxEgGkQ2','2026-08-28T22:17:08.433453+00:00'],
    ['8d37e207-e145-4c77-acb6-455b35a86e23','z0diax','$2b$10$wwxSjdZvgAGZYiZFltMi5eRaMZUDO7hqyBqPU8kqVN3RoqkLwskJW','2026-08-28T23:37:17.689432+00:00'],
    ['17e8bee7-da34-4121-9a16-e132264ad4c9','Ichigo','$2b$10$gqm9.oI6qsEgLkxvngmySO85EcDV6jKiCYYFZKTn80JgOHYvCbNTi','2026-08-28T17:35:29.594919+00:00'],
  ];
  for (const [id,username,ph,ca] of users) {
    await tx.execute({ sql: 'INSERT INTO users (id,username,password_hash,created_at,username_changed_at) VALUES (?,?,?,?,?)', args: [id,username,ph,ts(ca),null] });
  }
  console.log(`  ✅ users: ${users.length}`);

  // PROFILES
  const profiles = [
    {uid:'2da9ff77-bcfe-4ad6-86f3-47e9ffe0817b',dn:'Demo User',bio:'Just exploring VibeBin — click "Customize profile" vibes.\nTry uploading an avatar, a banner and a name effect!',be:1,au:'/demo/avatar.jpg',bu:'/demo/banner.jpg',bt:'image',nf:'#a78bfa',nt:'#f472b6',ns:'gradient',ne:'typewriter',es:50,ei:60,ac:'#8b5cf6',lk:[{url:'https://example.com',color:'#8b5cf6',label:'Website'},{url:'https://github.com',color:'#22d3ee',label:'GitHub'}],v:0,se:'',st:''},
    {uid:'763f8a37-94a3-465d-b37b-c24fa38794c8',dn:'Nova',bio:'Neon dreams & clean code.',be:1,au:null,bu:null,bt:'image',nf:'#22d3ee',nt:'#4ade80',ns:'gradient',ne:'neon',es:50,ei:60,ac:'#22d3ee',lk:[{url:'https://discord.com',color:'#f472b6',label:'Discord'}],v:0,se:'',st:''},
    {uid:'5e549a95-2e46-4ba2-9adc-22e5586067cf',dn:'Cool_name123',bio:'Fuvk me',be:1,au:null,bu:null,bt:'image',nf:'#4ade80',nt:'#a78bfa',ns:'gradient',ne:'aurora',es:23,ei:100,ac:'#8b5cf6',lk:[],v:0,se:'',st:''},
    {uid:'8382c93d-2585-49fe-a7d8-a8ecad5077a5',dn:'indiapooper',bio:'',be:1,au:null,bu:null,bt:'image',nf:'#a78bfa',nt:'#22d3ee',ns:'gradient',ne:'none',es:50,ei:60,ac:'#8b5cf6',lk:[],v:0,se:'',st:''},
    {uid:'9c6fe730-f938-4abc-b183-770ba43d9550',dn:'ʏᴏʀɪ',bio:'ᴅᴇᴠʟᴏᴘᴇʀ 🤌',be:1,au:'https://imglink.cc/cdn/kSHnr7RitJ.gif',bu:'https://imglink.cc/cdn/-N8cgQqnS5.mp4',bt:'video',nf:'#22d3ee',nt:'#3b82f6',ns:'gradient',ne:'typewriter',es:50,ei:60,ac:'#cdd2cb',lk:[{url:'https://t.me/+y8EekRvqpnQzNjZl',color:'#00ffff',label:'Telegram'}],v:52,se:'',st:''},
    {uid:'096cbb8d-7afb-4b0f-bf88-1dc4a94d25d2',dn:'cosmofic',bio:'🤧 kya hi bolu yar bas samjho ki beta tester hu',be:1,au:'https://imglink.cc/cdn/MEJTJRamLS.gif',bu:'https://imglink.cc/cdn/G2kUDinZeE.webp',bt:'image',nf:'#22d3ee',nt:'#3b82f6',ns:'gradient',ne:'rainbow',es:50,ei:60,ac:'#613dff',lk:[],v:6,se:'',st:''},
    {uid:'8d37e207-e145-4c77-acb6-455b35a86e23',dn:'z0diax',bio:'',be:1,au:null,bu:null,bt:'image',nf:'#a78bfa',nt:'#22d3ee',ns:'gradient',ne:'none',es:50,ei:60,ac:'#8198fb',lk:[],v:1,se:'',st:''},
    {uid:'45e7030d-1dd2-4aec-b70a-627443851ddc',dn:'Bulletyhaj',bio:'',be:1,au:null,bu:null,bt:'image',nf:'#a78bfa',nt:'#22d3ee',ns:'gradient',ne:'none',es:50,ei:60,ac:'#8b5cf6',lk:[],v:1,se:'',st:''},
    {uid:'25ef630c-c41a-44ec-94b1-a314bf2bb1e8',dn:'mahmoon',bio:'mwehehe',be:1,au:null,bu:null,bt:'image',nf:'#f87171',nt:'#22d3ee',ns:'gradient',ne:'aurora',es:50,ei:100,ac:'#00ffff',lk:[],v:1,se:'',st:''},
    {uid:'5cde6097-0ef9-42ab-b672-6713e0baa9ec',dn:'fffdddddddddd',bio:'',be:1,au:null,bu:null,bt:'image',nf:'#a78bfa',nt:'#22d3ee',ns:'gradient',ne:'none',es:50,ei:60,ac:'#8b5cf6',lk:[],v:1,se:'',st:''},
    {uid:'11a8214d-81e3-4754-814a-26d10efbe444',dn:'FEARFLESH',bio:'',be:1,au:null,bu:null,bt:'image',nf:'#4ade80',nt:'#a78bfa',ns:'solid',ne:'aurora',es:40,ei:42,ac:'#8b5cf6',lk:[],v:2,se:'',st:''},
    {uid:'17e8bee7-da34-4121-9a16-e132264ad4c9',dn:'Ichigo',bio:'Orewa!! Ichigo kurosaki 🥀',be:1,au:'https://imglink.cc/cdn/6i_7m3k9Ue.jpg',bu:'https://videotourl.com/videos/1787939151752-60eda470-8291-44f4-882d-96ae7a492d68.mp4',bt:'video',nf:'#a78bfa',nt:'#22d3ee',ns:'gradient',ne:'none',es:50,ei:60,ac:'#8b5cf6',lk:[],v:9,se:'',st:''},
  ];
  for (const p of profiles) {
    await tx.execute({ sql: 'INSERT INTO profiles (user_id,display_name,bio,bio_enabled,avatar_url,banner_url,banner_type,name_from,name_to,name_style,name_effect,effect_speed,effect_intensity,accent,links,views,status_emoji,status_text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', args: [p.uid,p.dn,p.bio,p.be,p.au,p.bu,p.bt,p.nf,p.nt,p.ns,p.ne,p.es,p.ei,p.ac,JSON.stringify(p.lk),p.v,p.se,p.st] });
  }
  console.log(`  ✅ profiles: ${profiles.length}`);

  // SIGNUP_IPS
  const sips = [['5e549a95-2e46-4ba2-9adc-22e5586067cf','72.9.243.24','2026-08-28T17:22:11.027928+00:00'],['096cbb8d-7afb-4b0f-bf88-1dc4a94d25d2','152.58.31.32','2026-08-28T17:25:50.208392+00:00'],['17e8bee7-da34-4121-9a16-e132264ad4c9','157.37.190.237','2026-08-28T17:35:30.444195+00:00'],['11a8214d-81e3-4754-814a-26d10efbe444','157.41.224.186','2026-08-28T17:42:05.47937+00:00'],['8382c93d-2585-49fe-a7d8-a8ecad5077a5','112.202.57.117','2026-08-28T17:53:00.470435+00:00'],['25ef630c-c41a-44ec-94b1-a314bf2bb1e8','175.158.243.10','2026-08-28T17:54:13.988825+00:00'],['45e7030d-1dd2-4aec-b70a-627443851ddc','210.79.171.12','2026-08-28T18:12:42.33736+00:00'],['5cde6097-0ef9-42ab-b672-6713e0baa9ec','103.88.234.111','2026-08-28T22:17:09.293049+00:00'],['8d37e207-e145-4c77-acb6-455b35a86e23','104.28.220.26','2026-08-28T23:37:18.557288+00:00']];
  for (const [uid,ip,ca] of sips) await tx.execute({sql:'INSERT INTO signup_ips (user_id,ip,created_at) VALUES (?,?,?)',args:[uid,ip,ts(ca)]});
  console.log(`  ✅ signup_ips: ${sips.length}`);

  // TAGS
  const tags = [['58aaf22f-6946-4077-a82f-290c349e77ed','Verified','#22d3ee','neon','2026-08-28T15:56:40.832408+00:00'],['dd381c6e-35f9-49c6-9b57-104f522b67be','OG','#a78bfa','shimmer','2026-08-28T15:56:41.285414+00:00'],['1c56781e-0e9a-49ac-83d2-6644b7bfd6eb','Bug Hunter','#f87171','fire','2026-08-28T15:56:41.738732+00:00'],['acb132b2-f981-438d-a06e-6ae1e302826a','Top 100','#4ade80','rainbow','2026-08-28T15:56:42.191888+00:00'],['ea965e4a-29bd-4a86-816a-b4e2ae49c19f','Gay Lord','#ff80ff','rainbow','2026-08-28T17:31:43.390763+00:00'],['67001a17-3084-48cb-889a-979f156523d7','Matrix','#bbc4bb','shimmer','2026-08-28T17:59:43.607465+00:00'],['8005722f-c4c4-4705-bbc7-a2d001604c3e','ғᴏᴜɴᴅᴇʀ','#8000ff','gold','2026-08-28T15:56:40.376391+00:00'],['def89f85-4225-4064-b4d6-0e575f5f555d','Founder','#fbbf24','gold','2026-08-28T18:27:35.615586+00:00']];
  for (const [id,label,color,effect,ca] of tags) await tx.execute({sql:'INSERT INTO tags (id,label,color,effect,created_at) VALUES (?,?,?,?,?)',args:[id,label,color,effect,ts(ca)]});
  console.log(`  ✅ tags: ${tags.length}`);

  // USER_TAGS
  const utags = [['9c6fe730-f938-4abc-b183-770ba43d9550','8005722f-c4c4-4705-bbc7-a2d001604c3e'],['096cbb8d-7afb-4b0f-bf88-1dc4a94d25d2','58aaf22f-6946-4077-a82f-290c349e77ed'],['11a8214d-81e3-4754-814a-26d10efbe444','58aaf22f-6946-4077-a82f-290c349e77ed'],['763f8a37-94a3-465d-b37b-c24fa38794c8','1c56781e-0e9a-49ac-83d2-6644b7bfd6eb'],['2da9ff77-bcfe-4ad6-86f3-47e9ffe0817b','ea965e4a-29bd-4a86-816a-b4e2ae49c19f'],['17e8bee7-da34-4121-9a16-e132264ad4c9','67001a17-3084-48cb-889a-979f156523d7']];
  for (const [uid,tid] of utags) await tx.execute({sql:'INSERT INTO user_tags (user_id,tag_id) VALUES (?,?)',args:[uid,tid]});
  console.log(`  ✅ user_tags: ${utags.length}`);

  // STICKERS
  const stickers = [['ace4a706-68b7-4a74-8c16-78fe1bb27d6b',':wave:','data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%23a78bfa%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%F0%9F%91%8B%3C%2Ftext%3E%3C%2Fsvg%3E','👋','Wave','2026-08-28T15:56:42.652713+00:00'],['cacafeb5-70aa-43c0-988e-4da9494ca069',':fire:','data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%23f97316%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%F0%9F%94%A5%3C%2Ftext%3E%3C%2Fsvg%3E','🔥','Fire','2026-08-28T15:56:43.108429+00:00'],['f5fe5eaf-d523-4b1a-afa1-078c1e4c733d',':rocket:','data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%2322d3ee%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%F0%9F%9A%80%3C%2Ftext%3E%3C%2Fsvg%3E','🚀','Rocket','2026-08-28T15:56:43.561824+00:00'],['41a4cd14-336b-4c8b-b1ad-901548e5049f',':sparkles:','data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%23facc15%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%E2%9C%A8%3C%2Ftext%3E%3C%2Fsvg%3E','✨','Sparkles','2026-08-28T15:56:44.01572+00:00'],['5e87a914-c4a8-43dc-8107-a355c1f5dec9',':100:','data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%23ef4444%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%F0%9F%92%AF%3C%2Ftext%3E%3C%2Fsvg%3E','💯','100','2026-08-28T15:56:44.474836+00:00'],['2d986a1a-5806-4805-94e3-192a0352cd53',':ok:','data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%234ade80%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%F0%9F%91%8C%3C%2Ftext%3E%3C%2Fsvg%3E','👌','OK','2026-08-28T15:56:44.904923+00:00'],['cc5543d7-1661-4408-899c-9522a6723593',':tada:','data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%23f472b6%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%F0%9F%8E%89%3C%2Ftext%3E%3C%2Fsvg%3E','🎉','Tada','2026-08-28T15:56:45.334165+00:00'],['251d732a-91c3-47bf-8bbf-7623295aa2dc',':bug:','data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%2384cc16%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%F0%9F%90%9B%3C%2Ftext%3E%3C%2Fsvg%3E','🐛','Bug','2026-08-28T15:56:45.763487+00:00'],['a80b71e3-aa37-4c49-a675-9aaca3e78da6',':heart:','data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%23f87171%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%E2%9D%A4%EF%B8%8F%3C%2Ftext%3E%3C%2Fsvg%3E','❤️','Heart','2026-08-28T15:56:46.193371+00:00'],['8ed69cfd-51b7-4162-96b0-7067cc6fd88c',':wew:','https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExM2VyZmtnbnA3MzJna2VlZTI5aGNheHhtZ3plNnlkYW5hbmV3aGJkeiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/IKFVtPf8jP6KJH16dB/giphy.gif',null,'reze','2026-08-28T17:42:49.64279+00:00'],['55f1b905-bd6b-4ef8-8bd0-691ea35cfcbe',':mm:','https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3cHJvenVsOTd6OTE2dmtvcHdnb2xzenhoMDhwOHhmc254cmk0cDN1MiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/yMocMAF7vTfEKGPwVB/giphy.gif',null,'MM','2026-08-28T17:43:33.294964+00:00'],['ce7818a0-f013-48c0-87be-b368f9379bf2',':kuru:','https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3b3hlYXpjYmF2YnljdXIzZWJvemticzl5OXYwYnRuZ2wwaGE0bmtuYyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/pcrqlLPgyGwCnKV9Aa/giphy.gif',null,'kuru','2026-08-28T17:46:44.795981+00:00'],['9de8d015-de4d-41e1-9a86-34dafde9ef66',':hug:','https://nekos.best/api/v2/hug/350aee04-6ec3-40a9-b45e-15c754b9c25d.gif','🤗','Anime hug','2026-08-29T10:20:38.736398+00:00'],['fe3a9941-a399-40c7-8ac2-ba0afe3a017c',':kiss:','https://nekos.best/api/v2/kiss/5a0e8e01-8992-4b7a-91ed-2bbf3ac7e5b9.gif','😘','Anime kiss','2026-08-29T10:20:39.156124+00:00'],['b447b92f-2a97-496d-85d2-514a2a16926c',':pat:','https://nekos.best/api/v2/pat/e704d636-0ed6-4559-92ec-61568fd10ef6.gif','🖐️','Anime pat','2026-08-29T10:20:39.575243+00:00'],['a4b72b7e-7dbe-446d-b51a-f06e326c5439',':blush:','https://nekos.best/api/v2/blush/50b11542-3d86-4368-af3c-1aa060cfcb72.gif','😊','Anime blush','2026-08-29T10:20:39.994691+00:00'],['5ce9b692-cd2b-439d-bd72-95eba872ce12',':cry:','https://nekos.best/api/v2/cry/eea3fe7e-0846-4e60-afc0-7e1a787eb556.gif','😢','Anime cry','2026-08-29T10:20:40.413784+00:00'],['1ff603c7-879f-4e21-ae37-de13c89e64e1',':wink:','https://nekos.best/api/v2/wink/75a33d9e-18a6-4777-8b0f-26231a8a6cfe.gif','😉','Anime wink','2026-08-29T10:20:40.833327+00:00'],['ef490295-ccfb-473d-b82a-4e0105607f80',':happy:','https://nekos.best/api/v2/happy/1158fd04-ee35-4897-afbd-ca397ecc6c3c.gif','😄','Anime happy','2026-08-29T10:20:41.252554+00:00'],['d7941f8e-a451-4408-9785-99499c5eb77a',':dance:','https://nekos.best/api/v2/dance/52b1e250-a89c-4c65-93ac-d490d54c700a.gif','💃','Anime dance','2026-08-29T10:20:41.67151+00:00'],['cb776ed8-7aaa-4eb6-94b9-9263482cd75e',':cuddle:','https://nekos.best/api/v2/cuddle/84b24863-5b47-495c-a9ee-8226655553c5.gif','🥰','Anime cuddle','2026-08-29T10:20:42.090101+00:00'],['9ac52db2-d8e3-442a-9a91-6b51983bdf32',':anime-wave:','https://nekos.best/api/v2/wave/3c855905-a12a-4bd1-8938-57067b791b0e.gif','👋','Anime wave','2026-08-29T10:20:42.509313+00:00']];
  for (const [id,token,url,emoji,label,ca] of stickers) await tx.execute({sql:'INSERT INTO stickers (id,token,url,emoji,label,created_at) VALUES (?,?,?,?,?,?)',args:[id,token,url,emoji as string | null,label,ts(ca as string)]});
  console.log(`  ✅ stickers: ${stickers.length}`);

  // PASTES
  const pastes = JSON.parse(readFileSync('scripts/pastes-data.json', 'utf-8'));
  for (const p of pastes) {
    await tx.execute({sql:'INSERT INTO pastes (id,user_id,title,title_color,format,content,language,visibility,password_hash,expires_at,pinned,views,likes_count,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',args:[p.id,p.user_id,p.title,p.title_color,p.format||'plain',p.content,p.language||'plaintext',p.visibility||'public',p.password_hash,p.expires_at?ts(p.expires_at):null,p.pinned?1:0,p.views||0,p.likes_count||0,ts(p.created_at)]});
  }
  console.log(`  ✅ pastes: ${pastes.length}`);

  // LIKES
  const likes = [['8925e107-5aac-4450-8833-aeadd9e7d2a2','ztyhax08','9c6fe730-f938-4abc-b183-770ba43d9550',null,'2026-08-29T10:22:31.999318+00:00'],['fc24f2fc-fffb-4d04-8789-812ed28555f6','634gm069','17e8bee7-da34-4121-9a16-e132264ad4c9',null,'2026-08-29T10:30:13.01386+00:00']];
  for (const [id,pid,uid,ih,ca] of likes) await tx.execute({sql:'INSERT INTO likes (id,paste_id,user_id,ip_hash,created_at) VALUES (?,?,?,?,?)',args:[id,pid,uid,ih as string | null,ts(ca as string)]});
  console.log(`  ✅ likes: ${likes.length}`);

  await tx.commit();
  console.log('\n✅ Database built successfully!');
  console.log(`📦 File: ${DB_FILE} — upload this to Turso!`);
}

main().catch(console.error);
