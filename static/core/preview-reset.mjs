// Preview servers start on an empty database, so browser records from an earlier preview boot
// reference experiences that no longer exist and would block saving forever.
const KEY='momo.preview-id';
export function resetPreviewLeftovers(state,storages){
  const id=state?.previewId,[local]=storages;
  if(!id||local.getItem(KEY)===id)return false;
  for(const storage of storages){for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key?.startsWith('momo.'))storage.removeItem(key);}}
  local.setItem(KEY,id);return true;
}
