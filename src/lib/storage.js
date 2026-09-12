export async function uploadProductPhoto(supabase, productId, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${productId}.${ext}`;
  const { error } = await supabase.storage.from('product-photos').upload(path, file, { upsert: true, cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from('product-photos').getPublicUrl(path);
  return data.publicUrl + '?t=' + Date.now(); // cache-bust so a re-upload shows immediately
}
