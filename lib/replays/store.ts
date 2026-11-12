import { MAX_ARCHIVE_BYTES, MAX_REPLAYS, type ReplayRecord } from './model';
const DB = 'arkpedia-auto-deploys-v1';
async function open(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('replays',{keyPath:['namespace','stageId']});request.result.createObjectStore('usage');};
    request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(new Error('This browser could not open auto-deploy storage.'));
  });
}
async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, done: (value:T)=>void)=>void): Promise<T> {
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['replays','usage'],mode); let result:T;
    tx.oncomplete=()=>{db.close();resolve(result);};
    tx.onabort=tx.onerror=()=>{db.close();reject(new Error('Auto-deploy storage is full or unavailable. Existing saves are safe.'));};
    try {action(tx.objectStore('replays'),value=>{result=value;});} catch(error){tx.abort();reject(error);}
  });
}
export async function readReplays(namespace: string): Promise<ReplayRecord[]> {
  return transact('readonly',(store,done)=>{const r=store.getAll(IDBKeyRange.bound([namespace,''],[namespace,'\uffff']));r.onsuccess=()=>done(r.result);});
}
export async function saveReplay(record: ReplayRecord): Promise<void> {
  return transact('readwrite',(store,done)=>{
    const prior=store.get([record.namespace,record.stageId]);
    prior.onsuccess=()=>{
      const usage=store.transaction.objectStore('usage'),read=usage.get('total');
      read.onsuccess=()=>{
        const old=prior.result as ReplayRecord|undefined;
        const previous=read.result??{count:0,bytes:0};
        const next={count:previous.count+(old?0:1),bytes:previous.bytes-(old?new TextEncoder().encode(old.payload).length:0)+new TextEncoder().encode(record.payload).length};
        if(next.count>MAX_REPLAYS||next.bytes>MAX_ARCHIVE_BYTES){store.transaction.abort();return;}
        usage.put(next,'total');store.put(record);done();
      };
    };
  });
}
export async function removeReplay(namespace:string,stageId:string):Promise<void>{
  return transact('readwrite',(store,done)=>{const old=store.get([namespace,stageId]);old.onsuccess=()=>{
    if(!old.result){done();return;}
    const usage=store.transaction.objectStore('usage'),read=usage.get('total');
    read.onsuccess=()=>{const previous=read.result??{count:1,bytes:0};usage.put({count:Math.max(0,previous.count-1),bytes:Math.max(0,previous.bytes-new TextEncoder().encode(old.result.payload).length)},'total');store.delete([namespace,stageId]);done();};
  };});
}
export async function clearReplays():Promise<void>{return transact('readwrite',(s,done)=>{s.clear();s.transaction.objectStore('usage').clear();done();});}
