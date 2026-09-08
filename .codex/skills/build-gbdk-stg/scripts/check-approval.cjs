#!/usr/bin/env node
const fs=require('node:fs'),crypto=require('node:crypto');
const [workflow,rom]=process.argv.slice(2);if(!rom)throw Error('Usage: node check-approval.cjs WORKFLOW.json ROM.gb');
const w=JSON.parse(fs.readFileSync(workflow,'utf8')),sha=crypto.createHash('sha256').update(fs.readFileSync(rom)).digest('hex');
if(!w.approval||!w.approval.userDecision?.trim()||!w.approval.messageReference?.trim()||w.approval.romSha256!==sha)throw Error('No recorded user approval for these exact ROM bytes. Return to playtest.');
console.log(JSON.stringify({approvedRomSha256:sha,recordedDecision:w.approval.userDecision,note:'Agent must verify this record against the actual user conversation.'}));
