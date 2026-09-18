import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) acc[m[1]] = m[2];
  return acc;
}, {});
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await supabase.from('lista_tipos').select('id,codigo,nombre,familia').ilike('nombre', '%scritura%').limit(10);
console.log(JSON.stringify(data, null, 2));
const { data: fams } = await supabase.from('lista_tipos').select('familia').limit(200);
console.log('familias unicas', [...new Set(fams.map(f=>f.familia))].filter(f=>f && f.toLowerCase().includes('doc')));
