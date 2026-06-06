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
  
  const { data: prompts } = await supabase.from('prompts').select('id, name, current_version').limit(10);
  console.log("Prompts:", prompts);

  if (prompts && prompts.length > 0) {
    for (const p of prompts) {
      const { data: versions } = await supabase.from('prompt_versions').select('id, version').eq('prompt_id', p.id);
      console.log(`Versions for ${p.name}:`, versions);
    }
  }
}

run();
