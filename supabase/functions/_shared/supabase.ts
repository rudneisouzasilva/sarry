import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Exige usuário autenticado no Supabase E cadastrado como morador da casa
export async function requireMember(req: Request, db: SupabaseClient): Promise<User> {
  const auth = req.headers.get('Authorization') ?? '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) throw new HttpError(401, 'Faça login para continuar');
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, 'Sessão inválida, entre novamente');
  const { data: member } = await db.from('members').select('user_id').eq('user_id', data.user.id).maybeSingle();
  if (!member) throw new HttpError(403, 'Sua conta ainda não foi liberada como moradora desta casa');
  return data.user;
}
