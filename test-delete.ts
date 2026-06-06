import { supabase } from './src/services/supabase.js';
import { getSession } from './src/services/session.js';

async function run() {
  const session = await getSession();
  if (session) {
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });
  }
  
  const { data: versions } = await supabase.from('prompt_versions').select('id, version').eq('version', '1.0.2');
  console.log("Found versions 1.0.2:", versions);

  if (versions && versions.length > 0) {
    const ids = versions.map(v => v.id);
    const { data, error } = await supabase.from('prompt_versions').delete().in('id', ids).select();
    console.log("Delete result data:", data);
    console.log("Delete result error:", error);
  }
}

run();
