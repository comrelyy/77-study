// Lesson audio (`.lesson.` ids) may not be synthesised yet; it must not stop a theme from opening.
export async function missingBootAssets(pack,exists){
  const needed=pack.assets.filter(a=>!String(a.id).includes('.lesson.'));
  const found=await Promise.all(needed.map(a=>exists(a.path)));
  return needed.filter((a,i)=>!found[i]).map(a=>a.path);
}
