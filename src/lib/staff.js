export async function loadStaffDirectory(supabase) {
  const { data, error } = await supabase.rpc('handysam_staff_directory');
  if (error) return {};
  const map = {};
  (data || []).forEach(r => { map[r.user_id] = r.email; });
  return map;
}

export async function getMyEmail(supabase) {
  const { data } = await supabase.auth.getUser();
  return data?.user?.email || '';
}
