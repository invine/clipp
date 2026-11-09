// A fresh real-network protocol peer, not a native second-runtime acceptance claim.
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPair, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { createLibp2pMessagingTransport } from '../../../../packages/core/network/engine.ts';
import { createIdentityManager } from '../../../../packages/core/trust/identity.ts';
import { decodePairingTarget, encodePairingTarget } from '../../../../packages/core/pairing/v2.ts';
import { PAIRING_PROTOCOL, verifyPairingTrustRequestSignature } from '../../../../packages/core/pairing/protocol.ts';
import { createPairingRuntimeSessions } from '../../../../packages/core/pairing/runtimeCoordinator.ts';
import { createKVPendingTrustRequestStore, createPendingTrustRequestCoordinator } from '../../../../packages/core/pairing/pending.ts';
import { systemRuntimeClock } from '../../../../packages/core/runtime/clock.ts';
const dir=path.dirname(fileURLToPath(import.meta.url));
function out(value:unknown){const r={at:new Date().toISOString(),...value as object};fs.appendFileSync(path.join(dir,'protocol-peer-trace.jsonl'),JSON.stringify(r)+'\n');console.log(JSON.stringify(r));}
const privateKey=await generateKeyPair('Ed25519');
const peerId=peerIdFromPrivateKey(privateKey).toString();
let stored:any;
const identity=createIdentityManager({repo:{get:async()=>stored,upsert:async value=>{stored=structuredClone(value)}},initialDeviceName:'UX Test Peer',generateKeyMaterial:async()=>({peerId,privateKey:Buffer.from(privateKeyToProtobuf(privateKey)).toString('base64'),publicKey:'unused-test-public-key'})});
await identity.get();
const transport=createLibp2pMessagingTransport({privateKey,relayAddresses:[],enableTcp:true,enableWebRTCDirect:false,enableDCUtR:false,isPeerKnown:async p=>await identity.membershipStatus(p)==='active',isPeerRevoked:async p=>await identity.membershipStatus(p)==='revoked'});
const sessions=createPairingRuntimeSessions({identity:async()=>({peerId,deviceName:'UX Test Peer',nameRevision:0}),send:(p,f)=>transport.send(PAIRING_PROTOCOL,p,f),sign:async bytes=>privateKey.sign(bytes),verify:verifyPairingTrustRequestSignature,membership:identity,clock:systemRuntimeClock,onChanged:()=>out({event:'initiator-state',waiting:sessions.waiting().length,errors:sessions.errors().length})});
const values=new Map<string,unknown>();
const pending=createPendingTrustRequestCoordinator({localPeerId:async()=>peerId,store:createKVPendingTrustRequestStore({storage:{get:async<T>(k:string)=>values.get(k) as T,set:async(k,v)=>{values.set(k,v)},remove:async k=>{values.delete(k)}},key:'pending'}),notifications:{show:async()=>out({event:'peer-incoming-notification-seam'}),dismiss:async()=>{},onSelect:()=>()=>{}},lifecycle:{openApprovalView:()=>{}},clock:systemRuntimeClock,verify:verifyPairingTrustRequestSignature,membership:identity,sendResponse:(p,f)=>transport.send(PAIRING_PROTOCOL,p,f),responseIdentity:async()=>({deviceName:'UX Test Peer',nameRevision:0n}),onChanged:requests=>out({event:'peer-incoming-pending',count:requests.length})});
sessions.start();await pending.start();
transport.onMessage(PAIRING_PROTOCOL,(from,frame)=>{void sessions.receive(from,frame,(p,f)=>pending.receive(p,f)).then(decision=>out({event:'received-decision',decision}),e=>out({event:'receive-failed',error:e.message}))});
await transport.start();
const image=PNG.sync.read(fs.readFileSync(path.join(dir,'electron-pairing-qr.png')));
const qr=jsQR(new Uint8ClampedArray(image.data),image.width,image.height);
const target=decodePairingTarget(qr!.data)!;
await transport.importSignedPeerRecord!(target.targetPeerId,target.signedPeerRecord);
const signedPeerRecord=await transport.getSignedPeerRecord!();
fs.writeFileSync(path.join(dir,'protocol-peer-target.txt'),encodePairingTarget({targetPeerId:peerId,signedPeerRecord,deviceNameHint:'UX Test Peer'}));
out({ready:true,pid:process.pid,role:'Fresh headless peer using actual shared Pairing protocol; native UI under test is Electron',targetValid:!!target,relays:0,privateKeyPersisted:false});
const commands=readline.createInterface({input:process.stdin,terminal:false});let q=Promise.resolve();
commands.on('line',command=>{q=q.then(async()=>{try{
 if(command==='request'){await transport.connect(target.targetPeerId);await sessions.request(target.targetPeerId);out({requestSent:true,connections:transport.getPeerConnectionInfo?.().map(p=>({path:p.path,hasDirect:p.hasDirect,hasRelay:p.hasRelay}))})}
 else if(command==='state')out({waiting:sessions.waiting().length,pending:(await pending.list()).length,remoteMembership:await identity.membershipStatus(target.targetPeerId),connections:transport.getPeerConnectionInfo?.().map(p=>({path:p.path,hasDirect:p.hasDirect,hasRelay:p.hasRelay}))});
 else if(command==='accept'||command==='reject'){const entry=(await pending.list())[0];if(!entry)throw Error('No pending peer request');await pending.decide(entry.initiatorPeerId,command==='accept'?'accepted':'rejected');out({peerDecision:command})}
 else if(command==='quit'){await sessions.stop();await pending.stop();await transport.stop();out({closed:true});process.exit(0)}
 else throw Error('Unknown command');
 }catch(e){out({command,error:(e as Error).message})}})});
